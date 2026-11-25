import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';
import { verifyAccessToken } from '../utils/crypto.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export interface AuthContext {
  userId: string;
  sessionId: string;
  restaurantId: string | null;
  roleCode: string | null;
  isSuperAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization header');
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedError('Empty bearer token');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new UnauthorizedError('Invalid or expired access token');
    }

    const session = await prisma.userSession.findUnique({
      where: { id: payload.sid },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: {
          select: { isActive: true, isSuperAdmin: true },
        },
      },
    });

    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedError('Session is invalid or revoked');
    }

    if (!session.user.isActive) {
      throw new ForbiddenError('User account is deactivated');
    }

    req.auth = {
      userId: payload.sub,
      sessionId: payload.sid,
      restaurantId: payload.restaurantId,
      roleCode: payload.roleCode,
      isSuperAdmin: session.user.isSuperAdmin && payload.isSuperAdmin,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(new UnauthorizedError());
    return;
  }
  if (!req.auth.isSuperAdmin) {
    next(new ForbiddenError('Super Admin privileges required'));
    return;
  }
  next();
}
