import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/errors.js';

export interface TenantContext {
  restaurantId: string;
  branchId: string | null;
  roleId: string;
  roleCode: string;
  permissions: Set<string>;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

/**
 * Enforces strict server-side tenant isolation for authenticated restaurant staff/owners.
 * Never trusts restaurant_id / tenant_id from request body, query, params, or headers.
 */
export async function requireTenantMember(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) {
      throw new UnauthorizedError();
    }

    const tokenRestaurantId = req.auth.restaurantId;
    if (!tokenRestaurantId) {
      throw new ForbiddenError('No active restaurant tenant bound to session');
    }

    // Reject explicit cross-tenant tampering attempts in query/body/headers
    const claimedTenant =
      (req.headers['x-tenant-id'] as string | undefined) ||
      (req.query.restaurantId as string | undefined) ||
      (req.query.tenantId as string | undefined) ||
      (req.body && typeof req.body === 'object'
        ? (req.body.restaurantId as string | undefined) || (req.body.tenantId as string | undefined)
        : undefined);

    if (claimedTenant && claimedTenant !== tokenRestaurantId) {
      throw new ForbiddenError('Cross-tenant access denied');
    }

    const membership = await prisma.restaurantUser.findUnique({
      where: {
        restaurantId_userId: {
          restaurantId: tokenRestaurantId,
          userId: req.auth.userId,
        },
      },
      include: {
        restaurant: { select: { id: true, status: true } },
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: { select: { code: true } },
              },
            },
          },
        },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenError('Active restaurant membership required');
    }

    if (membership.restaurant.status === 'SUSPENDED') {
      throw new ForbiddenError('Restaurant account is suspended');
    }

    const permissions = new Set(
      membership.role.rolePermissions.map((rp) => rp.permission.code),
    );

    req.tenant = {
      restaurantId: membership.restaurantId,
      branchId: membership.branchId,
      roleId: membership.roleId,
      roleCode: membership.role.code,
      permissions,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(permissionCode: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.tenant) {
      next(new ForbiddenError('Tenant context required'));
      return;
    }
    if (!req.tenant.permissions.has(permissionCode)) {
      next(new ForbiddenError(`Missing required permission: ${permissionCode}`));
      return;
    }
    next();
  };
}

/**
 * Resolves sanitized public restaurant branding from Host header or ?slug= fallback.
 * Never exposes unverified custom domains.
 */
export async function resolvePublicTenantBranding(hostHeader: string | undefined, slugParam?: string) {
  let restaurant = null;

  if (slugParam && typeof slugParam === 'string') {
    const cleanSlug = slugParam.trim().toLowerCase();
    restaurant = await prisma.restaurant.findUnique({
      where: { slug: cleanSlug },
      select: publicRestaurantSelect,
    });
  } else if (hostHeader) {
    const hostname = hostHeader.split(':')[0].trim().toLowerCase();

    // 1. Check verified custom/subdomain mapping
    const domainRecord = await prisma.restaurantDomain.findFirst({
      where: {
        hostname,
        isActive: true,
        status: 'VERIFIED',
      },
      include: {
        restaurant: { select: publicRestaurantSelect },
      },
    });

    if (domainRecord) {
      restaurant = domainRecord.restaurant;
    } else if (hostname.endsWith(`.${env.PLATFORM_BASE_DOMAIN}`)) {
      // 2. Subdomain pattern: <slug>.restaurantos.app
      const subSlug = hostname.slice(0, -(`.${env.PLATFORM_BASE_DOMAIN}`.length));
      if (subSlug && !subSlug.includes('.')) {
        restaurant = await prisma.restaurant.findUnique({
          where: { slug: subSlug },
          select: publicRestaurantSelect,
        });
      }
    }
  }

  if (!restaurant || restaurant.status === 'SUSPENDED') {
    throw new NotFoundError('Restaurant storefront not found');
  }

  return restaurant;
}

const publicRestaurantSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  description: true,
  logoUrl: true,
  faviconUrl: true,
  primaryColor: true,
  secondaryColor: true,
  backgroundColor: true,
  fontFamily: true,
  welcomeTitle: true,
  welcomeMessage: true,
  menuLayout: true,
  guestBrowsingEnabled: true,
  currency: true,
  timezone: true,
} as const;
