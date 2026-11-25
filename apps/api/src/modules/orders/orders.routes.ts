import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { withTenantScope } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { authenticateCustomer } from '../../middleware/customerAuth.js';
import { requirePermission, requireTenantMember } from '../../middleware/tenant.js';
import { emitSessionEvent, emitTenantEvent } from '../../realtime/socket.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { canTransitionOrder } from './orderStateMachine.js';

export const ordersRouter = Router();

/**
 * Customer places an order transactionally from their persisted PostgreSQL cart
 */
ordersRouter.post('/', authenticateCustomer, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tableSessionId, specialInstructions } = z
      .object({
        tableSessionId: z.string().uuid(),
        specialInstructions: z.string().trim().max(500).optional(),
      })
      .parse(req.body);

    const { restaurantId, customerId } = req.customerAuth!;

    const order = await withTenantScope(restaurantId, async (tx) => {
      const session = await tx.tableSession.findFirst({
        where: { id: tableSessionId, restaurantId, status: 'ACTIVE', orderingEnabled: true },
      });
      if (!session) throw new ValidationError('Table session is closed or ordering is disabled');

      const cart = await tx.cart.findUnique({
        where: { tableSessionId_customerId: { tableSessionId, customerId } },
        include: {
          items: {
            include: {
              product: { include: { variants: true, addons: true } },
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        throw new ValidationError('Your cart is empty');
      }

      const unavailable = cart.items.filter((i) => !i.product.isAvailable).map((i) => i.product.name);
      if (unavailable.length > 0) {
        throw new ValidationError(`Unavailable items in cart: ${unavailable.join(', ')}`);
      }

      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { taxRateBps: true },
      });

      let subtotalInr = 0;
      const orderItemsData = cart.items.map((item) => {
        const variant = item.variantId
          ? item.product.variants.find((v) => v.id === item.variantId)
          : undefined;
        const addonIdList = Array.isArray(item.addonIds) ? (item.addonIds as string[]) : [];
        const selectedAddons = item.product.addons.filter((a) => addonIdList.includes(a.id));

        const unitPriceInrSnap =
          item.product.basePriceInr +
          (variant?.priceDeltaInr ?? 0) +
          selectedAddons.reduce((s, a) => s + a.priceInr, 0);
        const lineTotalInr = unitPriceInrSnap * item.quantity;
        subtotalInr += lineTotalInr;

        return {
          restaurantId,
          productId: item.productId,
          productNameSnap: item.product.name,
          variantNameSnap: variant?.name ?? null,
          addonsSnap: selectedAddons.map((a) => ({ name: a.name, priceInr: a.priceInr })),
          unitPriceInrSnap,
          quantity: item.quantity,
          lineTotalInr,
          notes: item.notes,
        };
      });

      const taxInr = Math.round((subtotalInr * restaurant.taxRateBps) / 10000);
      const totalInr = subtotalInr + taxInr;
      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

      const created = await tx.order.create({
        data: {
          restaurantId,
          branchId: session.branchId,
          tableSessionId,
          customerId,
          orderNumber,
          status: 'PLACED',
          subtotalInr,
          taxInr,
          totalInr,
          specialInstructions,
          items: { create: orderItemsData },
          statusHistory: {
            create: {
              toStatus: 'PLACED',
              changedById: customerId,
              actorType: 'CUSTOMER',
            },
          },
          kitchenTicket: {
            create: {
              ticketNumber: `KDS-${Date.now().toString(36).toUpperCase()}`,
            },
          },
        },
        include: { items: true, kitchenTicket: true },
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return created;
    });

    emitTenantEvent(restaurantId, 'order:created', { orderId: order.id, orderNumber: order.orderNumber });
    emitSessionEvent(tableSessionId, 'order:updated', { orderId: order.id, status: order.status });

    res.status(201).json({ success: true, data: { order } });
  } catch (err) {
    next(err);
  }
});

/**
 * Customer: view personal order history in this restaurant
 */
ordersRouter.get('/my', authenticateCustomer, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { restaurantId, customerId } = req.customerAuth!;
    const orders = await withTenantScope(restaurantId, (tx) =>
      tx.order.findMany({
        where: { restaurantId, customerId },
        include: { items: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
    res.json({ success: true, data: { orders } });
  } catch (err) {
    next(err);
  }
});

/**
 * Staff/Owner: list live & historical orders for tenant
 */
ordersRouter.get(
  '/',
  authenticate,
  requireTenantMember,
  requirePermission('orders:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const orders = await withTenantScope(restaurantId, (tx) =>
        tx.order.findMany({
          where: { restaurantId },
          include: {
            items: true,
            tableSession: {
              select: { id: true, sessionCode: true, table: { select: { tableNumber: true } } },
            },
            customer: { select: { id: true, fullName: true, phone: true } },
            kitchenTicket: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      );
      res.json({ success: true, data: { orders } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Staff/Owner: validated order status transition
 */
ordersRouter.patch(
  '/:id/status',
  authenticate,
  requireTenantMember,
  requirePermission('orders:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const id = req.params.id as string;
      const { status, reason } = z
        .object({
          status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED']),
          reason: z.string().trim().max(300).optional(),
        })
        .parse(req.body);

      const updated = await withTenantScope(restaurantId, async (tx) => {
        const order = await tx.order.findFirst({ where: { id, restaurantId } });
        if (!order) throw new NotFoundError('Order not found');

        if (!canTransitionOrder(order.status, status)) {
          throw new ValidationError(`Invalid order transition from ${order.status} to ${status}`);
        }

        const nextOrder = await tx.order.update({
          where: { id },
          data: { status },
          include: { items: true },
        });

        await tx.orderStatusHistory.create({
          data: {
            restaurantId,
            orderId: id,
            fromStatus: order.status,
            toStatus: status,
            changedById: req.auth!.userId,
            actorType: 'USER',
            reason,
          },
        });

        if (status === 'PREPARING') {
          await tx.kitchenTicket.updateMany({
            where: { orderId: id, restaurantId },
            data: { startedAt: new Date() },
          });
        } else if (status === 'READY') {
          await tx.kitchenTicket.updateMany({
            where: { orderId: id, restaurantId },
            data: { readyAt: new Date() },
          });
        }

        return nextOrder;
      });

      emitTenantEvent(restaurantId, 'order:updated', { orderId: updated.id, status: updated.status });
      emitSessionEvent(updated.tableSessionId, 'order:updated', {
        orderId: updated.id,
        status: updated.status,
      });

      res.json({ success: true, data: { order: updated } });
    } catch (err) {
      next(err);
    }
  },
);
