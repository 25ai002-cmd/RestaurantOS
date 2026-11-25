import crypto from 'node:crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, withTenantScope } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { authenticateCustomer } from '../../middleware/customerAuth.js';
import { requirePermission, requireTenantMember } from '../../middleware/tenant.js';
import { generateOpaqueToken } from '../../utils/crypto.js';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../../utils/errors.js';

export const paymentsRouter = Router();

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/**
 * Customer initiates online payment for an APPROVED bill
 */
paymentsRouter.post('/create-order', authenticateCustomer, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { billId, idempotencyKey } = z
      .object({
        billId: z.string().uuid(),
        idempotencyKey: z.string().min(8).max(128),
      })
      .parse(req.body);

    const { restaurantId, customerId } = req.customerAuth!;

    const payment = await withTenantScope(restaurantId, async (tx) => {
      const existing = await tx.payment.findUnique({ where: { idempotencyKey } });
      if (existing) return existing;

      const bill = await tx.bill.findFirst({
        where: { id: billId, restaurantId, status: { in: ['APPROVED', 'PARTIALLY_PAID'] } },
      });
      if (!bill) throw new NotFoundError('Approved payable bill not found');

      const razorpayOrderId = `order_${generateOpaqueToken(10)}`;
      return tx.payment.create({
        data: {
          restaurantId,
          billId,
          customerId,
          method: 'RAZORPAY_ONLINE',
          status: 'CREATED',
          amountInr: bill.totalInr,
          razorpayOrderId,
          idempotencyKey,
        },
      });
    });

    res.status(201).json({ success: true, data: { payment } });
  } catch (err) {
    next(err);
  }
});

/**
 * Server-side Razorpay signature verification
 */
paymentsRouter.post('/verify', authenticateCustomer, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = z
      .object({
        razorpayOrderId: z.string().min(1),
        razorpayPaymentId: z.string().min(1),
        razorpaySignature: z.string().min(1),
      })
      .parse(req.body);

    const { restaurantId } = req.customerAuth!;

    const updated = await withTenantScope(restaurantId, async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { razorpayOrderId, restaurantId },
      });
      if (!payment) throw new NotFoundError('Payment record not found');

      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { razorpayKeySecretEnc: true },
      });

      const secret = restaurant.razorpayKeySecretEnc || process.env.RAZORPAY_TEST_SECRET || 'dev_rzp_secret';
      if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature, secret)) {
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
        throw new UnauthorizedError('Invalid Razorpay payment signature');
      }

      const captured = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'CAPTURED',
          razorpayPaymentId,
          paidAt: new Date(),
        },
      });

      await tx.bill.update({
        where: { id: payment.billId },
        data: { status: 'PAID' },
      });

      return captured;
    });

    res.json({ success: true, data: { payment: updated } });
  } catch (err) {
    next(err);
  }
});

/**
 * Idempotent Razorpay webhook receiver
 */
paymentsRouter.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventId, eventType, razorpayOrderId, razorpayPaymentId } = z
      .object({
        eventId: z.string().min(1),
        eventType: z.string().min(1),
        razorpayOrderId: z.string().min(1),
        razorpayPaymentId: z.string().optional(),
      })
      .parse(req.body);

    const alreadyProcessed = await prisma.paymentEvent.findUnique({
      where: { razorpayEventId: eventId },
    });
    if (alreadyProcessed) {
      res.json({ success: true, data: { duplicate: true } });
      return;
    }

    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId } });
    if (!payment) {
      throw new NotFoundError('Payment order not found');
    }

    await withTenantScope(payment.restaurantId, async (tx) => {
      await tx.paymentEvent.create({
        data: {
          restaurantId: payment.restaurantId,
          paymentId: payment.id,
          razorpayEventId: eventId,
          eventType,
          payload: req.body,
        },
      });

      if (eventType === 'payment.captured') {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'CAPTURED',
            ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
            paidAt: new Date(),
          },
        });
        await tx.bill.update({
          where: { id: payment.billId },
          data: { status: 'PAID' },
        });
      } else if (eventType === 'payment.failed') {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED' },
        });
      }
    });

    res.json({ success: true, data: { processed: true } });
  } catch (err) {
    next(err);
  }
});

/**
 * Staff/Owner: record offline payment (CASH, UPI_COUNTER, CARD_COUNTER)
 */
paymentsRouter.post(
  '/offline',
  authenticate,
  requireTenantMember,
  requirePermission('billing:approve'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const { billId, method, amountInr } = z
        .object({
          billId: z.string().uuid(),
          method: z.enum(['CASH', 'UPI_COUNTER', 'CARD_COUNTER']),
          amountInr: z.coerce.number().int().positive(),
        })
        .parse(req.body);

      const payment = await withTenantScope(restaurantId, async (tx) => {
        const bill = await tx.bill.findFirst({ where: { id: billId, restaurantId } });
        if (!bill) throw new NotFoundError('Bill not found');
        if (bill.status !== 'APPROVED' && bill.status !== 'PARTIALLY_PAID') {
          throw new ConflictError('Bill must be APPROVED before recording payment');
        }

        const p = await tx.payment.create({
          data: {
            restaurantId,
            billId,
            customerId: bill.customerId,
            method,
            status: 'CAPTURED',
            amountInr,
            idempotencyKey: `offline_${generateOpaqueToken(12)}`,
            paidAt: new Date(),
          },
        });

        await tx.bill.update({
          where: { id: billId },
          data: { status: amountInr >= bill.totalInr ? 'PAID' : 'PARTIALLY_PAID' },
        });

        return p;
      });

      res.status(201).json({ success: true, data: { payment } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Staff/Owner: issue refund on captured payment
 */
paymentsRouter.post(
  '/:id/refund',
  authenticate,
  requireTenantMember,
  requirePermission('billing:approve'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const id = req.params.id as string;
      const { amountInr, reason } = z
        .object({
          amountInr: z.coerce.number().int().positive(),
          reason: z.string().trim().max(300).optional(),
        })
        .parse(req.body);

      const refund = await withTenantScope(restaurantId, async (tx) => {
        const payment = await tx.payment.findFirst({ where: { id, restaurantId } });
        if (!payment) throw new NotFoundError('Payment not found');
        if (payment.status !== 'CAPTURED') {
          throw new ValidationError('Only CAPTURED payments can be refunded');
        }
        if (amountInr > payment.amountInr) {
          throw new ValidationError('Refund amount exceeds captured payment');
        }

        const r = await tx.refund.create({
          data: {
            restaurantId,
            paymentId: payment.id,
            amountInr,
            reason,
            status: 'PROCESSED',
            razorpayRefundId: `rfnd_${generateOpaqueToken(8)}`,
          },
        });

        await tx.payment.update({
          where: { id: payment.id },
          data: { status: amountInr === payment.amountInr ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
        });

        return r;
      });

      res.status(201).json({ success: true, data: { refund } });
    } catch (err) {
      next(err);
    }
  },
);
