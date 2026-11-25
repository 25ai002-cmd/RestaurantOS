import { Router, Request, Response, NextFunction } from 'express';
import { withTenantScope } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, requireTenantMember } from '../../middleware/tenant.js';
import { ValidationError } from '../../utils/errors.js';

export const onboardingRouter = Router();
onboardingRouter.use(authenticate, requireTenantMember);

onboardingRouter.get(
  '/status',
  requirePermission('restaurant:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const status = await withTenantScope(restaurantId, async (tx) => {
        const [restaurant, branchesCount, tablesCount, categoriesCount, productsCount, staffCount] =
          await Promise.all([
            tx.restaurant.findUniqueOrThrow({
              where: { id: restaurantId },
              select: {
                id: true,
                status: true,
                onboardingStep: true,
                onboardingCompleted: true,
                logoUrl: true,
                primaryColor: true,
                contactPhone: true,
                addressLine1: true,
              },
            }),
            tx.branch.count({ where: { restaurantId, isActive: true } }),
            tx.restaurantTable.count({ where: { restaurantId, isActive: true } }),
            tx.category.count({ where: { restaurantId, isActive: true } }),
            tx.product.count({ where: { restaurantId, isAvailable: true } }),
            tx.restaurantUser.count({ where: { restaurantId, status: 'ACTIVE' } }),
          ]);

        const checklist = {
          hasProfileDetails: Boolean(restaurant.contactPhone && restaurant.addressLine1),
          hasBranch: branchesCount > 0,
          hasTable: tablesCount > 0,
          hasCategory: categoriesCount > 0,
          hasProduct: productsCount > 0,
          hasStaff: staffCount > 0,
        };

        const readyToActivate =
          checklist.hasBranch && checklist.hasTable && checklist.hasCategory && checklist.hasProduct;

        return {
          restaurantStatus: restaurant.status,
          onboardingStep: restaurant.onboardingStep,
          onboardingCompleted: restaurant.onboardingCompleted,
          counts: { branchesCount, tablesCount, categoriesCount, productsCount, staffCount },
          checklist,
          readyToActivate,
        };
      });

      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  },
);

onboardingRouter.post(
  '/activate',
  requirePermission('restaurant:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const updated = await withTenantScope(restaurantId, async (tx) => {
        const [branchesCount, tablesCount, categoriesCount, productsCount] = await Promise.all([
          tx.branch.count({ where: { restaurantId, isActive: true } }),
          tx.restaurantTable.count({ where: { restaurantId, isActive: true } }),
          tx.category.count({ where: { restaurantId, isActive: true } }),
          tx.product.count({ where: { restaurantId, isAvailable: true } }),
        ]);

        if (branchesCount === 0 || tablesCount === 0 || categoriesCount === 0 || productsCount === 0) {
          throw new ValidationError(
            'Complete at least 1 active branch, 1 table, 1 menu category, and 1 product before activating.',
          );
        }

        const restaurant = await tx.restaurant.update({
          where: { id: restaurantId },
          data: {
            status: 'ACTIVE',
            onboardingCompleted: true,
            onboardingStep: 17,
          },
          select: { id: true, name: true, slug: true, status: true, onboardingCompleted: true },
        });

        await tx.auditLog.create({
          data: {
            restaurantId,
            actorId: req.auth!.userId,
            actorType: 'USER',
            action: 'RESTAURANT_ACTIVATED',
            resourceType: 'restaurant',
            resourceId: restaurantId,
            ipAddress: req.ip,
          },
        });

        return restaurant;
      });

      res.json({ success: true, data: { restaurant: updated } });
    } catch (err) {
      next(err);
    }
  },
);
