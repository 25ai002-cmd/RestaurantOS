import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { withTenantScope } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { authenticateCustomer } from '../../middleware/customerAuth.js';
import { requirePermission, requireTenantMember } from '../../middleware/tenant.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';

export const feedbackRouter = Router();

const DEFAULT_TEMPLATES: Record<number, string[]> = {
  5: ['Excellent food and quick service!', 'Loved the ambience and flavours.', 'Everything was fresh and delicious.'],
  4: ['Good food and pleasant experience.', 'Tasty dishes, slight wait time.', 'Overall a very good visit.'],
  3: ['Food was decent, service could be faster.', 'Average experience overall.'],
  2: ['Food temperature or taste needs improvement.', 'Service took longer than expected.'],
  1: ['Order did not meet expectations.', 'Had an issue with the order quality.'],
};

feedbackRouter.get('/templates', authenticateCustomer, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rating = Number(req.query.rating || 5);
    const clamped = Math.min(5, Math.max(1, Number.isFinite(rating) ? rating : 5));
    const custom = await withTenantScope(req.customerAuth!.restaurantId, (tx) =>
      tx.feedbackTemplate.findMany({
        where: { restaurantId: req.customerAuth!.restaurantId, ratingTier: clamped, isActive: true },
        select: { text: true },
      }),
    );
    const pool = custom.length > 0 ? custom.map((t) => t.text) : DEFAULT_TEMPLATES[clamped];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    res.json({ success: true, data: { suggestions: shuffled } });
  } catch (err) {
    next(err);
  }
});

feedbackRouter.post('/', authenticateCustomer, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId, rating, comment } = z
      .object({
        orderId: z.string().uuid(),
        rating: z.coerce.number().int().min(1).max(5),
        comment: z.string().trim().max(1500).optional(),
      })
      .parse(req.body);

    const { restaurantId, customerId } = req.customerAuth!;

    const fb = await withTenantScope(restaurantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, restaurantId, customerId },
      });
      if (!order) throw new NotFoundError('Order not found');

      const existing = await tx.feedback.findUnique({
        where: { orderId_customerId: { orderId, customerId } },
      });
      if (existing) throw new ConflictError('Feedback already submitted for this order');

      return tx.feedback.create({
        data: { restaurantId, orderId, customerId, rating, comment },
      });
    });

    res.status(201).json({ success: true, data: { feedback: fb } });
  } catch (err) {
    next(err);
  }
});

feedbackRouter.get(
  '/',
  authenticate,
  requireTenantMember,
  requirePermission('analytics:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.tenant!.restaurantId;
      const feedbacks = await withTenantScope(restaurantId, (tx) =>
        tx.feedback.findMany({
          where: { restaurantId },
          include: {
            customer: { select: { fullName: true, phone: true } },
            order: { select: { orderNumber: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      );
      res.json({ success: true, data: { feedbacks } });
    } catch (err) {
      next(err);
    }
  },
);
