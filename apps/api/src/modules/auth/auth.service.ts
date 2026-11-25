import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import {
  generateOpaqueToken,
  hashPassword,
  sha256,
  signAccessToken,
  slugify,
  verifyPassword,
} from '../../utils/crypto.js';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../../utils/errors.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

function getRefreshExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + env.JWT_REFRESH_TTL_DAYS);
  return d;
}

export async function registerOwner(input: RegisterInput, meta: { ip?: string; ua?: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const baseSlug = input.restaurantSlug || slugify(input.restaurantName);
  if (!baseSlug) {
    throw new ConflictError('Unable to derive a valid restaurant slug');
  }

  const slugExists = await prisma.restaurant.findUnique({ where: { slug: baseSlug } });
  if (slugExists) {
    throw new ConflictError('Restaurant slug is already taken');
  }

  const ownerRole = await prisma.role.findFirst({
    where: { restaurantId: null, code: 'OWNER' },
  });
  if (!ownerRole) {
    throw new Error('System OWNER role is missing. Run database seed.');
  }

  const starterPlan = await prisma.subscriptionPlan.findFirst({
    where: { code: 'STARTER' },
  });

  const passwordHash = await hashPassword(input.password);
  const refreshToken = generateOpaqueToken(48);
  const refreshTokenHash = sha256(refreshToken);
  const expiresAt = getRefreshExpiry();

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        phone: input.phone,
        fullName: input.fullName,
        passwordHash,
      },
    });

    const restaurant = await tx.restaurant.create({
      data: {
        name: input.restaurantName,
        slug: baseSlug,
        contactEmail: input.email,
        contactPhone: input.phone,
        status: 'PENDING_ONBOARDING',
        onboardingStep: 1,
      },
    });

    // Create default RestaurantOS subdomain mapping (verified automatically)
    await tx.restaurantDomain.create({
      data: {
        restaurantId: restaurant.id,
        hostname: `${baseSlug}.${env.PLATFORM_BASE_DOMAIN}`,
        domainType: 'SUBDOMAIN',
        status: 'VERIFIED',
        verificationToken: generateOpaqueToken(16),
        isPrimary: true,
        isActive: true,
        verifiedAt: new Date(),
      },
    });

    // Create default primary branch
    await tx.branch.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Main Branch',
        code: 'MAIN',
        phone: input.phone,
      },
    });

    // Assign OWNER membership
    await tx.restaurantUser.create({
      data: {
        restaurantId: restaurant.id,
        userId: user.id,
        roleId: ownerRole.id,
        status: 'ACTIVE',
      },
    });

    // Initialize trial subscription if STARTER plan exists
    if (starterPlan) {
      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 14);
      await tx.subscription.create({
        data: {
          restaurantId: restaurant.id,
          planId: starterPlan.id,
          status: 'TRIALING',
          billingCycle: 'MONTHLY',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      });
    }

    const session = await tx.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        ipAddress: meta.ip,
        userAgent: meta.ua,
        expiresAt,
      },
    });

    await tx.auditLog.create({
      data: {
        restaurantId: restaurant.id,
        actorId: user.id,
        actorType: 'USER',
        action: 'RESTAURANT_REGISTERED',
        resourceType: 'restaurant',
        resourceId: restaurant.id,
        ipAddress: meta.ip,
      },
    });

    return { user, restaurant, session };
  });

  const accessToken = signAccessToken({
    sub: result.user.id,
    sid: result.session.id,
    restaurantId: result.restaurant.id,
    roleCode: 'OWNER',
    isSuperAdmin: false,
  });

  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      fullName: result.user.fullName,
      isSuperAdmin: result.user.isSuperAdmin,
    },
    restaurant: {
      id: result.restaurant.id,
      name: result.restaurant.name,
      slug: result.restaurant.slug,
      status: result.restaurant.status,
    },
    tokens: {
      accessToken,
      refreshToken,
      expiresAt,
    },
  };
}

export async function loginUser(input: LoginInput, meta: { ip?: string; ua?: string }) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: {
      restaurantUsers: {
        where: { status: 'ACTIVE' },
        include: {
          restaurant: { select: { id: true, name: true, slug: true, status: true } },
          role: { select: { code: true, name: true } },
        },
      },
    },
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isActive) {
    throw new ForbiddenError('Account is deactivated');
  }

  let selectedMembership = user.restaurantUsers[0] ?? null;
  if (input.restaurantId) {
    const match = user.restaurantUsers.find((m) => m.restaurantId === input.restaurantId);
    if (!match) {
      throw new ForbiddenError('You do not belong to the requested restaurant');
    }
    selectedMembership = match;
  }

  if (selectedMembership && selectedMembership.restaurant.status === 'SUSPENDED') {
    throw new ForbiddenError('Restaurant account is suspended');
  }

  const refreshToken = generateOpaqueToken(48);
  const refreshTokenHash = sha256(refreshToken);
  const expiresAt = getRefreshExpiry();

  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      refreshTokenHash,
      ipAddress: meta.ip,
      userAgent: meta.ua,
      expiresAt,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const accessToken = signAccessToken({
    sub: user.id,
    sid: session.id,
    restaurantId: selectedMembership ? selectedMembership.restaurantId : null,
    roleCode: selectedMembership ? selectedMembership.role.code : null,
    isSuperAdmin: user.isSuperAdmin,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isSuperAdmin: user.isSuperAdmin,
    },
    restaurant: selectedMembership ? selectedMembership.restaurant : null,
    tokens: {
      accessToken,
      refreshToken,
      expiresAt,
    },
  };
}

export async function refreshSession(rawRefreshToken: string, meta: { ip?: string; ua?: string }) {
  const tokenHash = sha256(rawRefreshToken);
  const existing = await prisma.userSession.findUnique({
    where: { refreshTokenHash: tokenHash },
    include: {
      user: {
        include: {
          restaurantUsers: {
            where: { status: 'ACTIVE' },
            include: {
              restaurant: { select: { id: true, status: true } },
              role: { select: { code: true } },
            },
          },
        },
      },
    },
  });

  if (!existing || existing.revokedAt || existing.expiresAt < new Date() || !existing.user.isActive) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const newRefreshToken = generateOpaqueToken(48);
  const newRefreshHash = sha256(newRefreshToken);
  const expiresAt = getRefreshExpiry();

  const membership = existing.user.restaurantUsers[0] ?? null;

  const newSession = await prisma.$transaction(async (tx) => {
    await tx.userSession.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    return tx.userSession.create({
      data: {
        userId: existing.userId,
        refreshTokenHash: newRefreshHash,
        ipAddress: meta.ip,
        userAgent: meta.ua,
        expiresAt,
      },
    });
  });

  const accessToken = signAccessToken({
    sub: existing.user.id,
    sid: newSession.id,
    restaurantId: membership ? membership.restaurantId : null,
    roleCode: membership ? membership.role.code : null,
    isSuperAdmin: existing.user.isSuperAdmin,
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresAt,
  };
}

export async function logoutSession(sessionId: string): Promise<void> {
  await prisma.userSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
