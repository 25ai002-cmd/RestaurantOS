import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { withTenantScope } from '../../db/prisma.js';
import { authenticateCustomer } from '../../middleware/customerAuth.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

export const cartRouter = Router();
cartRouter.use(authenticateCustomer);

async function computeCartDetails(restaurantId: string, tableSessionId: string, customerId: string) {
  return withTenantScope(restaurantId, async (tx) => {
    const cart = await tx.cart.findUnique({
      where: { tableSessionId_customerId: { tableSessionId, customerId } },
      include: {
        items: {
          include: {
            product: {
              include: { variants: true, addons: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const restaurant = await tx.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { taxRateBps: true },
    });

    if (!cart) {
      return { id: null, items: [], subtotalInr: 0, taxInr: 0, totalInr: 0, unavailableItems: [] };
    }

    let subtotalInr = 0;
    const unavailableItems: string[] = [];

    const hydratedItems = cart.items.map((item) => {
      if (!item.product.isAvailable) {
        unavailableItems.push(item.product.name);
      }
      const variant = item.variantId
        ? item.product.variants.find((v) => v.id === item.variantId)
        : undefined;
      const addonIdList = Array.isArray(item.addonIds) ? (item.addonIds as string[]) : [];
      const selectedAddons = item.product.addons.filter((a) => addonIdList.includes(a.id));

      const unitPriceInr =
        item.product.basePriceInr +
        (variant?.priceDeltaInr ?? 0) +
        selectedAddons.reduce((sum, a) => sum + a.priceInr, 0);
      const lineTotalInr = unitPriceInr * item.quantity;
      subtotalInr += lineTotalInr;

      return {
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        isAvailable: item.product.isAvailable,
        variantId: item.variantId,
        variantName: variant?.name ?? null,
        addons: selectedAddons.map((a) => ({ id: a.id, name: a.name, priceInr: a.priceInr })),
        quantity: item.quantity,
        unitPriceInr,
        lineTotalInr,
        notes: item.notes,
      };
    });

    const taxInr = Math.round((subtotalInr * restaurant.taxRateBps) / 10000);
    const totalInr = subtotalInr + taxInr;

    return {
      id: cart.id,
      items: hydratedItems,
      subtotalInr,
      taxInr,
      totalInr,
      unavailableItems,
    };
  });
}

cartRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tableSessionId = req.query.tableSessionId as string;
    if (!tableSessionId) throw new ValidationError('tableSessionId query parameter is required');
    const cart = await computeCartDetails(
      req.customerAuth!.restaurantId,
      tableSessionId,
      req.customerAuth!.customerId,
    );
    res.json({ success: true, data: { cart } });
  } catch (err) {
    next(err);
  }
});

const addItemSchema = z.object({
  tableSessionId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  addonIds: z.array(z.string().uuid()).optional(),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
  notes: z.string().trim().max(300).optional(),
});

cartRouter.post('/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = addItemSchema.parse(req.body);
    const { restaurantId, customerId } = req.customerAuth!;

    await withTenantScope(restaurantId, async (tx) => {
      const session = await tx.tableSession.findFirst({
        where: { id: input.tableSessionId, restaurantId, status: 'ACTIVE', orderingEnabled: true },
      });
      if (!session) throw new ValidationError('Table session is not active for ordering');

      const product = await tx.product.findFirst({
        where: { id: input.productId, restaurantId, isAvailable: true },
      });
      if (!product) throw new NotFoundError('Product is unavailable or not found');

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const cart = await tx.cart.upsert({
        where: { tableSessionId_customerId: { tableSessionId: input.tableSessionId, customerId } },
        update: { expiresAt },
        create: {
          restaurantId,
          tableSessionId: input.tableSessionId,
          customerId,
          expiresAt,
        },
      });

      await tx.cartItem.create({
        data: {
          restaurantId,
          cartId: cart.id,
          productId: input.productId,
          variantId: input.variantId,
          addonIds: input.addonIds ?? [],
          quantity: input.quantity,
          notes: input.notes,
        },
      });
    });

    const cart = await computeCartDetails(restaurantId, input.tableSessionId, customerId);
    res.status(201).json({ success: true, data: { cart } });
  } catch (err) {
    next(err);
  }
});

cartRouter.patch('/items/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const itemId = req.params.itemId as string;
    const { quantity } = z.object({ quantity: z.coerce.number().int().min(0).max(50) }).parse(req.body);
    const { restaurantId, customerId } = req.customerAuth!;

    const tableSessionId = await withTenantScope(restaurantId, async (tx) => {
      const item = await tx.cartItem.findFirst({
        where: { id: itemId, restaurantId, cart: { customerId } },
        include: { cart: { select: { tableSessionId: true } } },
      });
      if (!item) throw new NotFoundError('Cart item not found');

      if (quantity === 0) {
        await tx.cartItem.delete({ where: { id: itemId } });
      } else {
        await tx.cartItem.update({ where: { id: itemId }, data: { quantity } });
      }
      return item.cart.tableSessionId;
    });

    const cart = await computeCartDetails(restaurantId, tableSessionId, customerId);
    res.json({ success: true, data: { cart } });
  } catch (err) {
    next(err);
  }
});
