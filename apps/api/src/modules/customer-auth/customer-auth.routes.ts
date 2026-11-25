import crypto from 'node:crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { authenticateCustomer, signCustomerAccessToken } from '../../middleware/customerAuth.js';
import { generateOpaqueToken, sha256 } from '../../utils/crypto.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../utils/errors.js';

export const customerAuthRouter = Router();

const requestOtpSchema = z.object({
  restaurantSlug: z.string().trim().toLowerCase().min(2),
  phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Valid mobile number required'),
});

customerAuthRouter.post('/request-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { restaurantSlug, phone } = requestOtpSchema.parse(req.body);
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
      select: { id: true, status: true },
    });
    if (!restaurant || restaurant.status === 'SUSPENDED') {
      throw new NotFoundError('Restaurant not found');
    }

    // Generate 6-digit OTP; never log OTP in production
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = sha256(`${restaurant.id}:${phone}:${otp}`);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.otpVerification.create({
      data: {
        restaurantId: restaurant.id,
        target: phone,
        purpose: 'CUSTOMER_LOGIN',
        otpHash,
        expiresAt,
      },
    });

    // In development/test, return devOtpPreview so staging/automated tests can verify without SMS gateway
    res.json({
      success: true,
      data: {
        message: 'OTP sent to mobile number',
        expiresInSeconds: 300,
        ...(env.NODE_ENV !== 'production' ? { devOtpPreview: otp } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
});

const verifyOtpSchema = z.object({
  restaurantSlug: z.string().trim().toLowerCase().min(2),
  phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/),
  otp: z.string().trim().length(6),
  fullName: z.string().trim().min(1).max(150).optional(),
});

customerAuthRouter.post('/verify-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { restaurantSlug, phone, otp, fullName } = verifyOtpSchema.parse(req.body);
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
      select: { id: true, status: true },
    });
    if (!restaurant || restaurant.status === 'SUSPENDED') {
      throw new NotFoundError('Restaurant not found');
    }

    const latestOtp = await prisma.otpVerification.findFirst({
      where: {
        restaurantId: restaurant.id,
        target: phone,
        purpose: 'CUSTOMER_LOGIN',
        verifiedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestOtp || latestOtp.expiresAt < new Date()) {
      throw new UnauthorizedError('OTP expired or not requested');
    }

    if (latestOtp.attempts >= latestOtp.maxAttempts) {
      throw new ValidationError('Maximum OTP attempts exceeded. Request a new OTP.');
    }

    const expectedHash = sha256(`${restaurant.id}:${phone}:${otp}`);
    if (latestOtp.otpHash !== expectedHash) {
      await prisma.otpVerification.update({
        where: { id: latestOtp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedError('Invalid OTP');
    }

    const refreshToken = generateOpaqueToken(32);
    const refreshTokenHash = sha256(refreshToken);
    const sessionExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const { customer, session } = await prisma.$transaction(async (tx) => {
      await tx.otpVerification.update({
        where: { id: latestOtp.id },
        data: { verifiedAt: new Date() },
      });

      const cust = await tx.customer.upsert({
        where: { restaurantId_phone: { restaurantId: restaurant.id, phone } },
        update: {
          phoneVerified: true,
          ...(fullName ? { fullName } : {}),
        },
        create: {
          restaurantId: restaurant.id,
          phone,
          fullName,
          phoneVerified: true,
        },
      });

      const sess = await tx.customerSession.create({
        data: {
          restaurantId: restaurant.id,
          customerId: cust.id,
          refreshTokenHash,
          expiresAt: sessionExpires,
        },
      });

      return { customer: cust, session: sess };
    });

    const accessToken = signCustomerAccessToken({
      customerId: customer.id,
      sessionId: session.id,
      restaurantId: restaurant.id,
      phone: customer.phone,
    });

    res.json({
      success: true,
      data: {
        accessToken,
        customer: {
          id: customer.id,
          phone: customer.phone,
          fullName: customer.fullName,
          restaurantId: restaurant.id,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

customerAuthRouter.get('/me', authenticateCustomer, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: {
        id: req.customerAuth!.customerId,
        restaurantId: req.customerAuth!.restaurantId,
      },
      select: { id: true, phone: true, fullName: true, restaurantId: true },
    });
    res.json({ success: true, data: { customer } });
  } catch (err) {
    next(err);
  }
});
