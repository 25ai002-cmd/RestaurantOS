import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, withTenantScope } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, requireTenantMember } from '../../middleware/tenant.js';
import { NotFoundError } from '../../utils/errors.js';

export const subscriptionsRouter = Router();

subscriptionsRouter.get('/plans', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { monthlyPriceInr: 'asc' },
    });
    res.json({ success: true, data: { plans } });
  } catch (err) {
    next(err);
  }
});

subscriptionsRouter.use(authenticate, requireTenantMember);

subscriptionsRouter.get(
  '/current',
  requirePermission('subscriptions:manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const [subscription, invoices] = await withTenantScope(restaurantId, (tx) =>
        Promise.all([
          tx.subscription.findFirst({
            where: { restaurantId },
            include: { plan: true },
            orderBy: { createdAt: 'desc' },
          }),
          tx.subscriptionInvoice.findMany({
            where: { restaurantId },
            orderBy: { createdAt: 'desc' },
          }),
        ]),
      );
      res.json({ success: true, data: { subscription, invoices } });
    } catch (err) {
      next(err);
    }
  },
);

subscriptionsRouter.post(
  '/change-plan',
  requirePermission('subscriptions:manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const { planId, billingCycle } = z
        .object({
          planId: z.string().uuid(),
          billingCycle: z.enum(['MONTHLY', 'ANNUAL']).default('MONTHLY'),
        })
        .parse(req.body);

      const result = await withTenantScope(restaurantId, async (tx) => {
        const plan = await tx.subscriptionPlan.findFirst({ where: { id: planId, isActive: true } });
        if (!plan) throw new NotFoundError('Subscription plan not found');

        const periodStart = new Date();
        const periodEnd = new Date();
        periodEnd.setDate(periodEnd.getDate() + (billingCycle === 'ANNUAL' ? 365 : 30));

        const sub = await tx.subscription.create({
          data: {
            restaurantId,
            planId: plan.id,
            status: 'ACTIVE',
            billingCycle,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
          },
          include: { plan: true },
        });

        const amountInr = billingCycle === 'ANNUAL' ? plan.annualPriceInr : plan.monthlyPriceInr;
        const taxInr = Math.round(amountInr * 0.18); // 18% GST on SaaS subscription

        const invoice = await tx.subscriptionInvoice.create({
          data: {
            restaurantId,
            subscriptionId: sub.id,
            invoiceNumber: `SAAS-${Date.now().toString(36).toUpperCase()}`,
            amountInr,
            taxInr,
            totalInr: amountInr + taxInr,
            status: 'PAID',
            paidAt: new Date(),
          },
        });

        return { subscription: sub, invoice };
      });

      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);
