import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { UnauthorizedError } from '../utils/errors.js';

export interface CustomerAuthContext {
  customerId: string;
  sessionId: string;
  restaurantId: string;
  phone: string;
}

declare global {
  namespace Express {
    interface Request {
      customerAuth?: CustomerAuthContext;
    }
  }
}

export function signCustomerAccessToken(payload: Omit<CustomerAuthContext, 'type'>): string {
  return jwt.sign({ ...payload, type: 'customer_access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: '24h',
  });
}

export async function authenticateCustomer(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Customer authentication required');
    }
    const token = header.slice('Bearer '.length).trim();

    let decoded: CustomerAuthContext & { type?: string };
    try {
      decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as CustomerAuthContext & { type?: string };
    } catch {
      throw new UnauthorizedError('Invalid or expired customer token');
    }

    if (decoded.type !== 'customer_access') {
      throw new UnauthorizedError('Invalid token type');
    }

    const session = await prisma.customerSession.findUnique({
      where: { id: decoded.sessionId },
      select: { id: true, customerId: true, restaurantId: true, revokedAt: true, expiresAt: true },
    });

    if (
      !session ||
      session.customerId !== decoded.customerId ||
      session.restaurantId !== decoded.restaurantId ||
      session.revokedAt ||
      session.expiresAt < new Date()
    ) {
      throw new UnauthorizedError('Customer session expired or revoked');
    }

    req.customerAuth = {
      customerId: decoded.customerId,
      sessionId: decoded.sessionId,
      restaurantId: decoded.restaurantId,
      phone: decoded.phone,
    };
    next();
  } catch (err) {
    next(err);
  }
}
