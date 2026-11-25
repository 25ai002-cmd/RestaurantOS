import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { withTenantScope } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import {
  requirePermission,
  requireTenantMember,
  resolvePublicTenantBranding,
} from '../../middleware/tenant.js';

export const publicTenantRouter = Router();
export const restaurantRouter = Router();

/**
 * Public white-label branding resolution by Host header or ?slug=
 */
publicTenantRouter.get('/tenant-context', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = typeof req.query.slug === 'string' ? req.query.slug : undefined;
    const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host;
    const branding = await resolvePublicTenantBranding(host, slug);

    res.json({
      success: true,
      data: { branding },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Authenticated tenant-isolated restaurant profile
 */
restaurantRouter.use(authenticate, requireTenantMember);

restaurantRouter.get(
  '/profile',
  requirePermission('restaurant:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const restaurant = await withTenantScope(restaurantId, (tx) =>
        tx.restaurant.findUniqueOrThrow({
          where: { id: restaurantId },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            onboardingStep: true,
            onboardingCompleted: true,
            description: true,
            contactEmail: true,
            contactPhone: true,
            addressLine1: true,
            city: true,
            state: true,
            country: true,
            postalCode: true,
            timezone: true,
            currency: true,
            gstin: true,
            fssaiLicense: true,
            logoUrl: true,
            faviconUrl: true,
            primaryColor: true,
            secondaryColor: true,
            backgroundColor: true,
            fontFamily: true,
            welcomeTitle: true,
            welcomeMessage: true,
            menuLayout: true,
            guestBrowsingEnabled: true,
            taxRateBps: true,
            serviceChargeBps: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      );

      res.json({ success: true, data: { restaurant } });
    } catch (err) {
      next(err);
    }
  },
);

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().max(2000).optional(),
  contactPhone: z.string().trim().max(20).optional(),
  addressLine1: z.string().trim().max(255).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontFamily: z.enum(['Inter', 'Geist']).optional(),
  welcomeTitle: z.string().trim().max(150).optional(),
  welcomeMessage: z.string().trim().max(1000).optional(),
});

restaurantRouter.patch(
  '/profile',
  requirePermission('restaurant:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const input = updateProfileSchema.parse(req.body);

      const updated = await withTenantScope(restaurantId, async (tx) => {
        const record = await tx.restaurant.update({
          where: { id: restaurantId },
          data: input,
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            primaryColor: true,
            secondaryColor: true,
            backgroundColor: true,
            fontFamily: true,
            updatedAt: true,
          },
        });

        await tx.auditLog.create({
          data: {
            restaurantId,
            actorId: req.auth!.userId,
            actorType: 'USER',
            action: 'RESTAURANT_PROFILE_UPDATED',
            resourceType: 'restaurant',
            resourceId: restaurantId,
            ipAddress: req.ip,
          },
        });

        return record;
      });

      res.json({ success: true, data: { restaurant: updated } });
    } catch (err) {
      next(err);
    }
  },
);
