import { Router, Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { loginSchema, registerSchema } from './auth.schema.js';
import { loginUser, logoutSession, refreshSession, registerOwner } from './auth.service.js';

export const authRouter = Router();

const REFRESH_COOKIE_NAME = 'ros_refresh_token';

function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    expires: expiresAt,
    path: '/api/v1/auth',
  });
}

authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = registerSchema.parse(req.body);
    const result = await registerOwner(input, {
      ip: req.ip,
      ua: req.get('user-agent'),
    });

    setRefreshCookie(res, result.tokens.refreshToken, result.tokens.expiresAt);

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        restaurant: result.restaurant,
        accessToken: result.tokens.accessToken,
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await loginUser(input, {
      ip: req.ip,
      ua: req.get('user-agent'),
    });

    setRefreshCookie(res, result.tokens.refreshToken, result.tokens.expiresAt);

    res.json({
      success: true,
      data: {
        user: result.user,
        restaurant: result.restaurant,
        accessToken: result.tokens.accessToken,
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!rawToken || typeof rawToken !== 'string') {
      throw new UnauthorizedError('Refresh cookie missing');
    }

    const tokens = await refreshSession(rawToken, {
      ip: req.ip,
      ua: req.get('user-agent'),
    });

    setRefreshCookie(res, tokens.refreshToken, tokens.expiresAt);

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await logoutSession(req.auth!.sessionId);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
    res.json({ success: true, data: { loggedOut: true } });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true,
        isSuperAdmin: true,
        emailVerified: true,
        restaurantUsers: {
          where: { status: 'ACTIVE' },
          select: {
            restaurantId: true,
            branchId: true,
            restaurant: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                primaryColor: true,
                logoUrl: true,
              },
            },
            role: {
              select: {
                code: true,
                name: true,
                rolePermissions: {
                  select: { permission: { select: { code: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const activeMembership = req.auth!.restaurantId
      ? user.restaurantUsers.find((m) => m.restaurantId === req.auth!.restaurantId) ?? null
      : null;

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          fullName: user.fullName,
          isSuperAdmin: user.isSuperAdmin,
          emailVerified: user.emailVerified,
        },
        activeRestaurant: activeMembership
          ? {
              ...activeMembership.restaurant,
              roleCode: activeMembership.role.code,
              roleName: activeMembership.role.name,
              permissions: activeMembership.role.rolePermissions.map((rp) => rp.permission.code),
            }
          : null,
        memberships: user.restaurantUsers.map((m) => ({
          restaurantId: m.restaurantId,
          restaurantName: m.restaurant.name,
          slug: m.restaurant.slug,
          roleCode: m.role.code,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});
