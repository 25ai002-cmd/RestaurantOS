import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { withTenantScope } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, requireTenantMember } from '../../middleware/tenant.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';

export const branchesRouter = Router();
branchesRouter.use(authenticate, requireTenantMember);

branchesRouter.get(
  '/',
  requirePermission('branches:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const branches = await withTenantScope(restaurantId, (tx) =>
        tx.branch.findMany({
          where: { restaurantId },
          include: { _count: { select: { tables: true } } },
          orderBy: { createdAt: 'asc' },
        }),
      );
      res.json({ success: true, data: { branches } });
    } catch (err) {
      next(err);
    }
  },
);

const createBranchSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]+$/)
    .min(2)
    .max(30),
  phone: z.string().trim().max(20).optional(),
  addressLine1: z.string().trim().max(255).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  businessHours: z.record(z.unknown()).optional(),
});

branchesRouter.post(
  '/',
  requirePermission('branches:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const input = createBranchSchema.parse(req.body);

      const branch = await withTenantScope(restaurantId, async (tx) => {
        const existing = await tx.branch.findUnique({
          where: { restaurantId_code: { restaurantId, code: input.code } },
        });
        if (existing) {
          throw new ConflictError(`Branch code ${input.code} already exists`);
        }

        return tx.branch.create({
          data: {
            restaurantId,
            name: input.name,
            code: input.code,
            phone: input.phone,
            addressLine1: input.addressLine1,
            city: input.city,
            state: input.state,
            postalCode: input.postalCode,
            businessHours: input.businessHours as object | undefined,
          },
        });
      });

      res.status(201).json({ success: true, data: { branch } });
    } catch (err) {
      next(err);
    }
  },
);

const updateBranchSchema = createBranchSchema.partial().extend({
  isActive: z.boolean().optional(),
});

branchesRouter.patch(
  '/:id',
  requirePermission('branches:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const id = req.params.id as string;
      const input = updateBranchSchema.parse(req.body);

      const branch = await withTenantScope(restaurantId, async (tx) => {
        const found = await tx.branch.findFirst({ where: { id, restaurantId } });
        if (!found) throw new NotFoundError('Branch not found');

        return tx.branch.update({
          where: { id },
          data: {
            ...input,
            businessHours: input.businessHours as object | undefined,
          },
        });
      });

      res.json({ success: true, data: { branch } });
    } catch (err) {
      next(err);
    }
  },
);
