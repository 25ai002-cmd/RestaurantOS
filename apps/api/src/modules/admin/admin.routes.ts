import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.js';

export const adminRouter = Router();

adminRouter.use(authenticate, requireSuperAdmin);

adminRouter.get('/restaurants', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const restaurants = await prisma.restaurant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        contactEmail: true,
        onboardingCompleted: true,
        createdAt: true,
        _count: {
          select: {
            branches: true,
            restaurantUsers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: { restaurants } });
  } catch (err) {
    next(err);
  }
});

const statusUpdateSchema = z.object({
  status: z.enum(['PENDING_ONBOARDING', 'ACTIVE', 'SUSPENDED', 'READ_ONLY']),
});

adminRouter.patch('/restaurants/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { status } = statusUpdateSchema.parse(req.body);

    const updated = await prisma.restaurant.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, slug: true, status: true },
    });

    await prisma.auditLog.create({
      data: {
        restaurantId: id,
        actorId: req.auth!.userId,
        actorType: 'USER',
        action: 'ADMIN_TENANT_STATUS_CHANGED',
        resourceType: 'restaurant',
        resourceId: id,
        metadata: { status },
        ipAddress: req.ip,
      },
    });

    res.json({ success: true, data: { restaurant: updated } });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/plans', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { monthlyPriceInr: 'asc' },
    });
    res.json({ success: true, data: { plans } });
  } catch (err) {
    next(err);
  }
});

const patchPlanSchema = z.object({
  monthlyPriceInr: z.coerce.number().int().min(0).optional(),
  annualPriceInr: z.coerce.number().int().min(0).optional(),
  maxBranches: z.coerce.number().int().min(1).optional(),
  maxStaff: z.coerce.number().int().min(1).optional(),
  customDomainEnabled: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

adminRouter.patch('/plans/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const input = patchPlanSchema.parse(req.body);
    const plan = await prisma.subscriptionPlan.update({
      where: { id },
      data: input,
    });
    res.json({ success: true, data: { plan } });
  } catch (err) {
    next(err);
  }
});
