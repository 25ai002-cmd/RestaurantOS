import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, withTenantScope } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, requireTenantMember } from '../../middleware/tenant.js';
import { NotFoundError } from '../../utils/errors.js';

export const menuRouter = Router();
export const publicMenuRouter = Router();

/**
 * Public menu endpoint for customer storefronts (guest browsing)
 */
publicMenuRouter.get('/menu/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = (req.params.slug as string).trim().toLowerCase();
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: { id: true, status: true, guestBrowsingEnabled: true, taxRateBps: true, currency: true },
    });

    if (!restaurant || restaurant.status === 'SUSPENDED') {
      throw new NotFoundError('Restaurant menu not found');
    }

    const categories = await prisma.category.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        products: {
          where: { isAvailable: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            variants: { where: { isAvailable: true } },
            addons: { where: { isAvailable: true } },
          },
        },
      },
    });

    res.json({
      success: true,
      data: {
        restaurantId: restaurant.id,
        taxRateBps: restaurant.taxRateBps,
        currency: restaurant.currency,
        categories,
      },
    });
  } catch (err) {
    next(err);
  }
});

menuRouter.use(authenticate, requireTenantMember);

menuRouter.get(
  '/',
  requirePermission('menu:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const categories = await withTenantScope(restaurantId, (tx) =>
        tx.category.findMany({
          where: { restaurantId },
          orderBy: { sortOrder: 'asc' },
          include: {
            products: {
              orderBy: { sortOrder: 'asc' },
              include: { variants: true, addons: true },
            },
          },
        }),
      );
      res.json({ success: true, data: { categories } });
    } catch (err) {
      next(err);
    }
  },
);

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).optional(),
  sortOrder: z.coerce.number().int().default(0),
});

menuRouter.post(
  '/categories',
  requirePermission('menu:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const input = createCategorySchema.parse(req.body);
      const category = await withTenantScope(restaurantId, (tx) =>
        tx.category.create({
          data: { restaurantId, ...input },
        }),
      );
      res.status(201).json({ success: true, data: { category } });
    } catch (err) {
      next(err);
    }
  },
);

const createProductSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).optional(),
  imageUrl: z.string().url().max(500).optional().or(z.literal('')),
  basePriceInr: z.coerce.number().int().min(0), // paise
  dietaryType: z.enum(['VEG', 'NON_VEG', 'EGGETARIAN', 'VEGAN']).default('VEG'),
  isAvailable: z.boolean().default(true),
  variants: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        priceDeltaInr: z.coerce.number().int().default(0),
      }),
    )
    .optional(),
  addons: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        priceInr: z.coerce.number().int().min(0),
      }),
    )
    .optional(),
});

menuRouter.post(
  '/products',
  requirePermission('menu:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const input = createProductSchema.parse(req.body);

      const product = await withTenantScope(restaurantId, async (tx) => {
        const cat = await tx.category.findFirst({
          where: { id: input.categoryId, restaurantId },
        });
        if (!cat) throw new NotFoundError('Category not found');

        return tx.product.create({
          data: {
            restaurantId,
            categoryId: input.categoryId,
            name: input.name,
            description: input.description,
            imageUrl: input.imageUrl || undefined,
            basePriceInr: input.basePriceInr,
            dietaryType: input.dietaryType,
            isAvailable: input.isAvailable,
            variants: input.variants?.length
              ? {
                  create: input.variants.map((v) => ({
                    restaurantId,
                    name: v.name,
                    priceDeltaInr: v.priceDeltaInr,
                  })),
                }
              : undefined,
            addons: input.addons?.length
              ? {
                  create: input.addons.map((a) => ({
                    restaurantId,
                    name: a.name,
                    priceInr: a.priceInr,
                  })),
                }
              : undefined,
          },
          include: { variants: true, addons: true },
        });
      });

      res.status(201).json({ success: true, data: { product } });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.patch(
  '/products/:id',
  requirePermission('menu:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const id = req.params.id as string;
      const patchSchema = z.object({
        name: z.string().trim().min(1).max(150).optional(),
        description: z.string().trim().max(2000).optional(),
        basePriceInr: z.coerce.number().int().min(0).optional(),
        isAvailable: z.boolean().optional(),
        dietaryType: z.enum(['VEG', 'NON_VEG', 'EGGETARIAN', 'VEGAN']).optional(),
      });
      const input = patchSchema.parse(req.body);

      const product = await withTenantScope(restaurantId, async (tx) => {
        const found = await tx.product.findFirst({ where: { id, restaurantId } });
        if (!found) throw new NotFoundError('Product not found');
        return tx.product.update({
          where: { id },
          data: input,
          include: { variants: true, addons: true },
        });
      });

      res.json({ success: true, data: { product } });
    } catch (err) {
      next(err);
    }
  },
);

const bulkImportSchema = z.object({
  items: z
    .array(
      z.object({
        categoryName: z.string().trim().min(1).max(120),
        name: z.string().trim().min(1).max(150),
        description: z.string().trim().max(2000).optional(),
        basePriceInr: z.coerce.number().int().min(0),
        dietaryType: z.enum(['VEG', 'NON_VEG', 'EGGETARIAN', 'VEGAN']).default('VEG'),
      }),
    )
    .min(1)
    .max(100),
});

menuRouter.post(
  '/bulk-import',
  requirePermission('menu:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const { items } = bulkImportSchema.parse(req.body);

      const createdCount = await withTenantScope(restaurantId, async (tx) => {
        const existingCats = await tx.category.findMany({ where: { restaurantId } });
        const catMap = new Map(existingCats.map((c) => [c.name.toLowerCase(), c.id]));

        const existingProds = await tx.product.findMany({
          where: { restaurantId },
          select: { name: true, categoryId: true },
        });
        const prodSet = new Set(existingProds.map((p) => `${p.categoryId}:${p.name.toLowerCase()}`));

        let count = 0;
        for (const item of items) {
          const catKey = item.categoryName.toLowerCase();
          let categoryId = catMap.get(catKey);
          if (!categoryId) {
            const newCat = await tx.category.create({
              data: { restaurantId, name: item.categoryName },
            });
            categoryId = newCat.id;
            catMap.set(catKey, categoryId);
          }

          const prodKey = `${categoryId}:${item.name.toLowerCase()}`;
          if (!prodSet.has(prodKey)) {
            await tx.product.create({
              data: {
                restaurantId,
                categoryId,
                name: item.name,
                description: item.description,
                basePriceInr: item.basePriceInr,
                dietaryType: item.dietaryType,
                isAvailable: true,
              },
            });
            prodSet.add(prodKey);
            count++;
          }
        }
        return count;
      });

      res.status(201).json({ success: true, data: { createdCount } });
    } catch (err) {
      next(err);
    }
  },
);
