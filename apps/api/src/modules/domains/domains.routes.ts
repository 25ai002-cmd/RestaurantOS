import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { withTenantScope } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, requireTenantMember } from '../../middleware/tenant.js';
import { generateOpaqueToken } from '../../utils/crypto.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';

export const domainsRouter = Router();
domainsRouter.use(authenticate, requireTenantMember);

domainsRouter.get(
  '/',
  requirePermission('restaurant:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const domains = await withTenantScope(restaurantId, (tx) =>
        tx.restaurantDomain.findMany({
          where: { restaurantId },
          orderBy: { createdAt: 'asc' },
        }),
      );
      res.json({ success: true, data: { domains } });
    } catch (err) {
      next(err);
    }
  },
);

const addDomainSchema = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'Invalid hostname'),
});

domainsRouter.post(
  '/',
  requirePermission('restaurant:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const { hostname } = addDomainSchema.parse(req.body);

      const domain = await withTenantScope(restaurantId, async (tx) => {
        const sub = await tx.subscription.findFirst({
          where: { restaurantId, status: { in: ['TRIALING', 'ACTIVE', 'GRACE_PERIOD'] } },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
        });
        if (sub && !sub.plan.customDomainEnabled) {
          throw new ForbiddenError('Custom domains require Professional or Enterprise plan');
        }

        const existing = await tx.restaurantDomain.findUnique({ where: { hostname } });
        if (existing) {
          throw new ConflictError('Domain is already registered');
        }

        return tx.restaurantDomain.create({
          data: {
            restaurantId,
            hostname,
            domainType: 'CUSTOM',
            status: 'PENDING_VERIFICATION',
            verificationToken: `ros-verify=${generateOpaqueToken(16)}`,
            isActive: false,
          },
        });
      });

      res.status(201).json({ success: true, data: { domain } });
    } catch (err) {
      next(err);
    }
  },
);

domainsRouter.post(
  '/:id/verify',
  requirePermission('restaurant:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const id = req.params.id as string;

      const domain = await withTenantScope(restaurantId, async (tx) => {
        const found = await tx.restaurantDomain.findFirst({ where: { id, restaurantId } });
        if (!found) throw new NotFoundError('Domain not found');

        return tx.restaurantDomain.update({
          where: { id },
          data: {
            status: 'VERIFIED',
            isActive: true,
            verifiedAt: new Date(),
          },
        });
      });

      res.json({ success: true, data: { domain } });
    } catch (err) {
      next(err);
    }
  },
);
