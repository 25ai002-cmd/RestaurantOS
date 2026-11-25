import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { publicTenantRouter, restaurantRouter } from './modules/tenant/tenant.routes.js';
import { staffRouter } from './modules/staff/staff.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { onboardingRouter } from './modules/onboarding/onboarding.routes.js';
import { branchesRouter } from './modules/branches/branches.routes.js';
import { domainsRouter } from './modules/domains/domains.routes.js';
import { publicQrRouter, tablesRouter } from './modules/tables/tables.routes.js';
import { menuRouter, publicMenuRouter } from './modules/menu/menu.routes.js';
import { customerAuthRouter } from './modules/customer-auth/customer-auth.routes.js';
import { cartRouter } from './modules/cart/cart.routes.js';
import { sessionsRouter } from './modules/sessions/sessions.routes.js';
import { ordersRouter } from './modules/orders/orders.routes.js';
import { kdsRouter } from './modules/kds/kds.routes.js';
import { billingRouter } from './modules/billing/billing.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { feedbackRouter } from './modules/feedback/feedback.routes.js';
import { analyticsRouter } from './modules/analytics/analytics.routes.js';
import { subscriptionsRouter } from './modules/subscriptions/subscriptions.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow non-browser / same-origin requests and configured origins (including Netlify)
        if (
          !origin ||
          env.corsOriginsList.includes(origin) ||
          (env.NODE_ENV === 'development' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
        ) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.NODE_ENV === 'test' ? 1000 : 60,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authLimiter, authRouter);
  app.use('/api/v1/customer/auth', authLimiter, customerAuthRouter);
  app.use('/api/v1/public', publicTenantRouter);
  app.use('/api/v1/public', publicQrRouter);
  app.use('/api/v1/public', publicMenuRouter);
  app.use('/api/v1/restaurant', restaurantRouter);
  app.use('/api/v1/onboarding', onboardingRouter);
  app.use('/api/v1/branches', branchesRouter);
  app.use('/api/v1/domains', domainsRouter);
  app.use('/api/v1/tables', tablesRouter);
  app.use('/api/v1/menu', menuRouter);
  app.use('/api/v1/cart', cartRouter);
  app.use('/api/v1/sessions', sessionsRouter);
  app.use('/api/v1/orders', ordersRouter);
  app.use('/api/v1/kds', kdsRouter);
  app.use('/api/v1/bills', billingRouter);
  app.use('/api/v1/payments', paymentsRouter);
  app.use('/api/v1/feedback', feedbackRouter);
  app.use('/api/v1/analytics', analyticsRouter);
  app.use('/api/v1/subscriptions', subscriptionsRouter);
  app.use('/api/v1/staff', staffRouter);
  app.use('/api/v1/admin', adminRouter);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      },
    });
  });

  app.use(errorHandler);

  return app;
}
