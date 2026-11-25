import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, withTenantScope } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, requireTenantMember } from '../../middleware/tenant.js';
import { generateOpaqueToken } from '../../utils/crypto.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';

export const tablesRouter = Router();
export const publicQrRouter = Router();

/**
 * Public QR resolution — resolves restaurant, branch, and table from opaque revocable qrToken.
 * Never exposes internal secrets or other tables.
 */
publicQrRouter.get('/qr/:qrToken', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const qrToken = req.params.qrToken as string;
    const table = await prisma.restaurantTable.findUnique({
      where: { qrToken },
      select: {
        id: true,
        tableNumber: true,
        capacity: true,
        isActive: true,
        branch: {
          select: { id: true, name: true, isActive: true },
        },
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            logoUrl: true,
            primaryColor: true,
            secondaryColor: true,
            backgroundColor: true,
            fontFamily: true,
            welcomeTitle: true,
            welcomeMessage: true,
            guestBrowsingEnabled: true,
            currency: true,
          },
        },
      },
    });

    if (!table || !table.isActive || !table.branch.isActive || table.restaurant.status === 'SUSPENDED') {
      throw new NotFoundError('QR code is invalid or inactive');
    }

    res.json({
      success: true,
      data: {
        table: { id: table.id, tableNumber: table.tableNumber, capacity: table.capacity },
        branch: { id: table.branch.id, name: table.branch.name },
        restaurant: table.restaurant,
      },
    });
  } catch (err) {
    next(err);
  }
});

tablesRouter.use(authenticate, requireTenantMember);

tablesRouter.get(
  '/',
  requirePermission('tables:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;

      const tables = await withTenantScope(restaurantId, (tx) =>
        tx.restaurantTable.findMany({
          where: { restaurantId, ...(branchId ? { branchId } : {}) },
          include: {
            branch: { select: { id: true, name: true, code: true } },
            tableSessions: {
              where: { status: { in: ['ACTIVE', 'BILLING_PENDING'] } },
              include: {
                _count: { select: { customers: true, orders: true } },
              },
            },
          },
          orderBy: { tableNumber: 'asc' },
        }),
      );

      res.json({ success: true, data: { tables } });
    } catch (err) {
      next(err);
    }
  },
);

const createTableSchema = z.object({
  branchId: z.string().uuid(),
  tableNumber: z.string().trim().min(1).max(30),
  capacity: z.coerce.number().int().min(1).max(50).default(4),
});

tablesRouter.post(
  '/',
  requirePermission('tables:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const input = createTableSchema.parse(req.body);

      const table = await withTenantScope(restaurantId, async (tx) => {
        const branch = await tx.branch.findFirst({
          where: { id: input.branchId, restaurantId },
        });
        if (!branch) throw new NotFoundError('Branch not found');

        const existing = await tx.restaurantTable.findUnique({
          where: { branchId_tableNumber: { branchId: input.branchId, tableNumber: input.tableNumber } },
        });
        if (existing) throw new ConflictError(`Table ${input.tableNumber} already exists in this branch`);

        return tx.restaurantTable.create({
          data: {
            restaurantId,
            branchId: input.branchId,
            tableNumber: input.tableNumber,
            capacity: input.capacity,
            qrToken: `ros_qr_${generateOpaqueToken(16)}`,
          },
        });
      });

      res.status(201).json({ success: true, data: { table } });
    } catch (err) {
      next(err);
    }
  },
);

tablesRouter.post(
  '/:id/rotate-qr',
  requirePermission('tables:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const id = req.params.id as string;

      const table = await withTenantScope(restaurantId, async (tx) => {
        const found = await tx.restaurantTable.findFirst({ where: { id, restaurantId } });
        if (!found) throw new NotFoundError('Table not found');

        return tx.restaurantTable.update({
          where: { id },
          data: { qrToken: `ros_qr_${generateOpaqueToken(16)}` },
        });
      });

      res.json({ success: true, data: { table } });
    } catch (err) {
      next(err);
    }
  },
);
