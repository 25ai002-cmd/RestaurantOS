import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { withTenantScope } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, requireTenantMember } from '../../middleware/tenant.js';
import { hashPassword } from '../../utils/crypto.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';

export const staffRouter = Router();

staffRouter.use(authenticate, requireTenantMember);

staffRouter.get(
  '/',
  requirePermission('staff:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const staff = await withTenantScope(restaurantId, (tx) =>
        tx.restaurantUser.findMany({
          where: { restaurantId },
          select: {
            id: true,
            status: true,
            branchId: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                phone: true,
              },
            },
            role: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
      );

      res.json({ success: true, data: { staff } });
    } catch (err) {
      next(err);
    }
  },
);

const createStaffSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(255).toLowerCase(),
  phone: z.string().trim().min(8).max(20).optional(),
  password: z.string().min(8).max(100),
  roleCode: z.enum(['MANAGER', 'KITCHEN_STAFF', 'CASHIER', 'WAITER']),
  branchId: z.string().uuid().optional(),
});

staffRouter.post(
  '/',
  requirePermission('staff:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const input = createStaffSchema.parse(req.body);

      const result = await withTenantScope(restaurantId, async (tx) => {
        const role = await tx.role.findFirst({
          where: { restaurantId: null, code: input.roleCode },
        });
        if (!role) {
          throw new NotFoundError(`Role ${input.roleCode} not found`);
        }

        if (input.branchId) {
          const branch = await tx.branch.findFirst({
            where: { id: input.branchId, restaurantId },
          });
          if (!branch) {
            throw new NotFoundError('Branch not found in this restaurant');
          }
        }

        let user = await tx.user.findUnique({ where: { email: input.email } });
        if (!user) {
          const passwordHash = await hashPassword(input.password);
          user = await tx.user.create({
            data: {
              email: input.email,
              phone: input.phone,
              fullName: input.fullName,
              passwordHash,
            },
          });
        }

        const existingMembership = await tx.restaurantUser.findUnique({
          where: {
            restaurantId_userId: { restaurantId, userId: user.id },
          },
        });
        if (existingMembership) {
          throw new ConflictError('User is already a staff member of this restaurant');
        }

        const membership = await tx.restaurantUser.create({
          data: {
            restaurantId,
            userId: user.id,
            roleId: role.id,
            branchId: input.branchId,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            status: true,
            branchId: true,
            user: { select: { id: true, fullName: true, email: true, phone: true } },
            role: { select: { code: true, name: true } },
          },
        });

        await tx.auditLog.create({
          data: {
            restaurantId,
            actorId: req.auth!.userId,
            actorType: 'USER',
            action: 'STAFF_ADDED',
            resourceType: 'restaurant_user',
            resourceId: membership.id,
            metadata: { roleCode: input.roleCode },
            ipAddress: req.ip,
          },
        });

        return membership;
      });

      res.status(201).json({ success: true, data: { staffMember: result } });
    } catch (err) {
      next(err);
    }
  },
);
