import { Router, Request, Response, NextFunction } from 'express';
import { withTenantScope } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, requireTenantMember } from '../../middleware/tenant.js';

export const kdsRouter = Router();
kdsRouter.use(authenticate, requireTenantMember);

kdsRouter.get(
  '/tickets',
  requirePermission('kitchen:operate'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const tickets = await withTenantScope(restaurantId, (tx) =>
        tx.kitchenTicket.findMany({
          where: {
            restaurantId,
            order: { status: { in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'] } },
          },
          include: {
            order: {
              include: {
                items: true,
                tableSession: { select: { table: { select: { tableNumber: true } } } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        }),
      );
      res.json({ success: true, data: { tickets } });
    } catch (err) {
      next(err);
    }
  },
);
