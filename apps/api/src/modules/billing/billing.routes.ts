import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { withTenantScope } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { authenticateCustomer } from '../../middleware/customerAuth.js';
import { requirePermission, requireTenantMember } from '../../middleware/tenant.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';

export const billingRouter = Router();

/**
 * Customer: view approved/paid bills for their orders
 */
billingRouter.get('/my', authenticateCustomer, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { restaurantId, customerId } = req.customerAuth!;
    const bills = await withTenantScope(restaurantId, (tx) =>
      tx.bill.findMany({
        where: {
          restaurantId,
          status: { in: ['APPROVED', 'PARTIALLY_PAID', 'PAID'] },
          OR: [
            { customerId },
            { billOrders: { some: { order: { customerId } } } },
          ],
        },
        include: {
          payments: { select: { id: true, method: true, status: true, amountInr: true, paidAt: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
    res.json({ success: true, data: { bills } });
  } catch (err) {
    next(err);
  }
});

billingRouter.use(authenticate, requireTenantMember);

billingRouter.get(
  '/',
  requirePermission('billing:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const bills = await withTenantScope(restaurantId, (tx) =>
        tx.bill.findMany({
          where: { restaurantId },
          include: {
            tableSession: { select: { id: true, sessionCode: true, table: { select: { tableNumber: true } } } },
            customer: { select: { id: true, fullName: true, phone: true } },
            payments: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      );
      res.json({ success: true, data: { bills } });
    } catch (err) {
      next(err);
    }
  },
);

const draftBillSchema = z.object({
  tableSessionId: z.string().uuid(),
  billType: z.enum(['INDIVIDUAL', 'COMBINED']),
  customerId: z.string().uuid().optional(),
  discountInr: z.coerce.number().int().min(0).default(0),
});

billingRouter.post(
  '/draft',
  requirePermission('billing:approve'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const input = draftBillSchema.parse(req.body);

      if (input.billType === 'INDIVIDUAL' && !input.customerId) {
        throw new ValidationError('customerId is required for INDIVIDUAL bills');
      }

      const bill = await withTenantScope(restaurantId, async (tx) => {
        const session = await tx.tableSession.findFirst({
          where: { id: input.tableSessionId, restaurantId },
          include: {
            table: { select: { tableNumber: true } },
            branch: { select: { name: true, addressLine1: true } },
            restaurant: { select: { name: true, gstin: true, serviceChargeBps: true } },
          },
        });
        if (!session) throw new NotFoundError('Table session not found');

        const orders = await tx.order.findMany({
          where: {
            restaurantId,
            tableSessionId: input.tableSessionId,
            status: { not: 'CANCELLED' },
            ...(input.billType === 'INDIVIDUAL' ? { customerId: input.customerId } : {}),
            billOrders: { none: {} },
          },
          include: { items: true },
        });

        if (orders.length === 0) {
          throw new ConflictError('No unbilled active orders found for this selection');
        }

        const subtotalInr = orders.reduce((s, o) => s + o.subtotalInr, 0);
        const taxInr = orders.reduce((s, o) => s + o.taxInr, 0);
        const serviceChargeInr = Math.round((subtotalInr * session.restaurant.serviceChargeBps) / 10000);
        const discountInr = Math.min(input.discountInr, subtotalInr + taxInr + serviceChargeInr);
        const totalInr = Math.max(0, subtotalInr + taxInr + serviceChargeInr - discountInr);

        const invoiceNumber = `INV-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;

        const snapshotData = {
          restaurantName: session.restaurant.name,
          gstin: session.restaurant.gstin,
          branchName: session.branch.name,
          tableNumber: session.table.tableNumber,
          orders: orders.map((o) => ({
            orderNumber: o.orderNumber,
            items: o.items.map((i) => ({
              name: i.productNameSnap,
              variant: i.variantNameSnap,
              quantity: i.quantity,
              unitPriceInr: i.unitPriceInrSnap,
              lineTotalInr: i.lineTotalInr,
            })),
          })),
        };

        return tx.bill.create({
          data: {
            restaurantId,
            branchId: session.branchId,
            tableSessionId: input.tableSessionId,
            customerId: input.billType === 'INDIVIDUAL' ? input.customerId : null,
            invoiceNumber,
            billType: input.billType,
            status: 'DRAFT',
            subtotalInr,
            discountInr,
            taxInr,
            serviceChargeInr,
            totalInr,
            snapshotData,
            billOrders: {
              create: orders.map((o) => ({ restaurantId, orderId: o.id })),
            },
          },
          include: { billOrders: true },
        });
      });

      res.status(201).json({ success: true, data: { bill } });
    } catch (err) {
      next(err);
    }
  },
);

billingRouter.post(
  '/:id/approve',
  requirePermission('billing:approve'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const id = req.params.id as string;

      const bill = await withTenantScope(restaurantId, async (tx) => {
        const found = await tx.bill.findFirst({ where: { id, restaurantId } });
        if (!found) throw new NotFoundError('Bill not found');
        if (found.status !== 'DRAFT') {
          throw new ConflictError(`Bill cannot be approved from status ${found.status}`);
        }

        const updated = await tx.bill.update({
          where: { id },
          data: {
            status: 'APPROVED',
            approvedByUserId: req.auth!.userId,
            approvedAt: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            restaurantId,
            actorId: req.auth!.userId,
            actorType: 'USER',
            action: 'BILL_APPROVED',
            resourceType: 'bill',
            resourceId: id,
            ipAddress: req.ip,
          },
        });

        return updated;
      });

      res.json({ success: true, data: { bill } });
    } catch (err) {
      next(err);
    }
  },
);
