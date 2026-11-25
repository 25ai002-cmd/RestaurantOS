import { Router, Request, Response, NextFunction } from 'express';
import { withTenantScope } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, requireTenantMember } from '../../middleware/tenant.js';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate, requireTenantMember);

analyticsRouter.get(
  '/overview',
  requirePermission('analytics:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;

      const overview = await withTenantScope(restaurantId, async (tx) => {
        const [
          totalOrders,
          pendingOrders,
          activeTables,
          pendingBills,
          capturedPayments,
          topItemsRaw,
          avgRatingAgg,
        ] = await Promise.all([
          tx.order.count({ where: { restaurantId, status: { not: 'CANCELLED' } } }),
          tx.order.count({ where: { restaurantId, status: { in: ['PLACED', 'ACCEPTED', 'PREPARING'] } } }),
          tx.tableSession.count({ where: { restaurantId, status: { in: ['ACTIVE', 'BILLING_PENDING'] } } }),
          tx.bill.count({ where: { restaurantId, status: { in: ['DRAFT', 'APPROVED'] } } }),
          tx.payment.findMany({
            where: { restaurantId, status: 'CAPTURED' },
            select: { amountInr: true, method: true },
          }),
          tx.orderItem.groupBy({
            by: ['productNameSnap'],
            where: { restaurantId },
            _sum: { quantity: true, lineTotalInr: true },
            orderBy: { _sum: { quantity: 'desc' } },
            take: 5,
          }),
          tx.feedback.aggregate({
            where: { restaurantId },
            _avg: { rating: true },
            _count: { rating: true },
          }),
        ]);

        const totalRevenueInr = capturedPayments.reduce((s, p) => s + p.amountInr, 0);
        const averageOrderValueInr = totalOrders > 0 ? Math.round(totalRevenueInr / totalOrders) : 0;

        const paymentMethods: Record<string, number> = {};
        for (const p of capturedPayments) {
          paymentMethods[p.method] = (paymentMethods[p.method] || 0) + p.amountInr;
        }

        return {
          totalRevenueInr,
          totalOrders,
          pendingOrders,
          activeTables,
          pendingBills,
          averageOrderValueInr,
          averageRating: avgRatingAgg._avg.rating ? Number(avgRatingAgg._avg.rating.toFixed(2)) : null,
          feedbackCount: avgRatingAgg._count.rating,
          paymentMethods,
          popularItems: topItemsRaw.map((i) => ({
            name: i.productNameSnap,
            quantity: i._sum.quantity ?? 0,
            revenueInr: i._sum.lineTotalInr ?? 0,
          })),
        };
      });

      res.json({ success: true, data: overview });
    } catch (err) {
      next(err);
    }
  },
);
