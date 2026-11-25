import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { withTenantScope } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { authenticateCustomer } from '../../middleware/customerAuth.js';
import { requirePermission, requireTenantMember } from '../../middleware/tenant.js';
import { generateOpaqueToken } from '../../utils/crypto.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';

export const sessionsRouter = Router();

/**
 * Customer joins (or opens) an active table session via revocable qrToken.
 * Multiple customers can join the same active table session.
 */
sessionsRouter.post('/join', authenticateCustomer, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { qrToken } = z.object({ qrToken: z.string().min(4) }).parse(req.body);
    const { restaurantId, customerId } = req.customerAuth!;

    const session = await withTenantScope(restaurantId, async (tx) => {
      const table = await tx.restaurantTable.findFirst({
        where: { qrToken, restaurantId, isActive: true },
      });
      if (!table) throw new NotFoundError('QR code does not match an active table in this restaurant');

      let activeSession = await tx.tableSession.findFirst({
        where: { restaurantId, tableId: table.id, status: 'ACTIVE' },
        orderBy: { openedAt: 'desc' },
      });

      if (!activeSession) {
        activeSession = await tx.tableSession.create({
          data: {
            restaurantId,
            branchId: table.branchId,
            tableId: table.id,
            sessionCode: `TS-${generateOpaqueToken(3).toUpperCase()}`,
            status: 'ACTIVE',
          },
        });
        await tx.restaurantTable.update({
          where: { id: table.id },
          data: { status: 'OCCUPIED' },
        });
      }

      await tx.tableSessionCustomer.upsert({
        where: {
          tableSessionId_customerId: { tableSessionId: activeSession.id, customerId },
        },
        update: {},
        create: {
          restaurantId,
          tableSessionId: activeSession.id,
          customerId,
        },
      });

      return activeSession;
    });

    res.json({ success: true, data: { tableSession: session } });
  } catch (err) {
    next(err);
  }
});

/**
 * Staff/Owner: list active table sessions
 */
sessionsRouter.get(
  '/active',
  authenticate,
  requireTenantMember,
  requirePermission('tables:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const sessions = await withTenantScope(restaurantId, (tx) =>
        tx.tableSession.findMany({
          where: { restaurantId, status: { in: ['ACTIVE', 'BILLING_PENDING'] } },
          include: {
            table: { select: { id: true, tableNumber: true } },
            branch: { select: { id: true, name: true } },
            customers: {
              include: { customer: { select: { id: true, phone: true, fullName: true } } },
            },
            orders: {
              select: { id: true, orderNumber: true, status: true, totalInr: true, customerId: true },
            },
          },
          orderBy: { openedAt: 'desc' },
        }),
      );
      res.json({ success: true, data: { sessions } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Staff/Owner: close a table session after billing/service is complete
 */
sessionsRouter.post(
  '/:id/close',
  authenticate,
  requireTenantMember,
  requirePermission('tables:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const id = req.params.id as string;

      const closed = await withTenantScope(restaurantId, async (tx) => {
        const session = await tx.tableSession.findFirst({ where: { id, restaurantId } });
        if (!session) throw new NotFoundError('Table session not found');
        if (session.status === 'CLOSED') throw new ConflictError('Table session is already closed');

        const updated = await tx.tableSession.update({
          where: { id },
          data: { status: 'CLOSED', orderingEnabled: false, closedAt: new Date() },
        });

        await tx.restaurantTable.update({
          where: { id: session.tableId },
          data: { status: 'AVAILABLE' },
        });

        return updated;
      });

      res.json({ success: true, data: { tableSession: closed } });
    } catch (err) {
      next(err);
    }
  },
);
