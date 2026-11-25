import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PERMISSIONS = [
  { code: 'restaurant:read', module: 'restaurant', description: 'View restaurant profile & settings' },
  { code: 'restaurant:write', module: 'restaurant', description: 'Edit restaurant profile & branding' },
  { code: 'branches:read', module: 'branches', description: 'View branches' },
  { code: 'branches:write', module: 'branches', description: 'Create and edit branches' },
  { code: 'tables:read', module: 'tables', description: 'View tables and active sessions' },
  { code: 'tables:write', module: 'tables', description: 'Manage tables and close sessions' },
  { code: 'menu:read', module: 'menu', description: 'View menu categories and products' },
  { code: 'menu:write', module: 'menu', description: 'Manage menu categories, products, variants, addons' },
  { code: 'staff:read', module: 'staff', description: 'View staff members' },
  { code: 'staff:write', module: 'staff', description: 'Invite, assign roles, and deactivate staff' },
  { code: 'orders:read', module: 'orders', description: 'View live and historical orders' },
  { code: 'orders:write', module: 'orders', description: 'Accept, reject, and update order status' },
  { code: 'kitchen:operate', module: 'kitchen', description: 'Operate Kitchen Display System (KDS)' },
  { code: 'billing:read', module: 'billing', description: 'View bills and payment records' },
  { code: 'billing:approve', module: 'billing', description: 'Approve bills and apply discounts' },
  { code: 'analytics:read', module: 'analytics', description: 'View revenue and operational analytics' },
  { code: 'subscriptions:manage', module: 'subscriptions', description: 'Manage SaaS subscription plan' },
];

const SYSTEM_ROLES: Record<string, { name: string; description: string; permissions: string[] }> = {
  OWNER: {
    name: 'Restaurant Owner',
    description: 'Full control over restaurant, branches, menu, staff, billing, and subscriptions',
    permissions: PERMISSIONS.map((p) => p.code),
  },
  MANAGER: {
    name: 'Branch Manager',
    description: 'Manage daily operations, menu, tables, orders, staff, and billing',
    permissions: [
      'restaurant:read',
      'branches:read',
      'tables:read',
      'tables:write',
      'menu:read',
      'menu:write',
      'staff:read',
      'orders:read',
      'orders:write',
      'kitchen:operate',
      'billing:read',
      'billing:approve',
      'analytics:read',
    ],
  },
  KITCHEN_STAFF: {
    name: 'Kitchen Staff',
    description: 'Operate KDS and update order preparation status',
    permissions: ['orders:read', 'orders:write', 'kitchen:operate', 'menu:read'],
  },
  CASHIER: {
    name: 'Cashier',
    description: 'Approve bills, record payments, and manage table checkout',
    permissions: ['tables:read', 'tables:write', 'orders:read', 'billing:read', 'billing:approve'],
  },
  WAITER: {
    name: 'Waiter / Server',
    description: 'Manage tables, view orders, and mark orders served',
    permissions: ['tables:read', 'tables:write', 'menu:read', 'orders:read', 'orders:write'],
  },
};

const PLANS = [
  {
    code: 'STARTER',
    name: 'Starter',
    tier: 'STARTER' as const,
    description: 'RestaurantOS subdomain, basic branding, single branch',
    monthlyPriceInr: 149900, // Rs 1,499
    annualPriceInr: 1499000, // Rs 14,990
    maxBranches: 1,
    maxStaff: 10,
    maxTables: 25,
    customDomainEnabled: false,
    advancedBrandingEnabled: false,
    analyticsEnabled: true,
  },
  {
    code: 'PROFESSIONAL',
    name: 'Professional',
    tier: 'PROFESSIONAL' as const,
    description: 'Verified custom domain, advanced white-label branding, multi-branch',
    monthlyPriceInr: 399900, // Rs 3,999
    annualPriceInr: 3999000, // Rs 39,990
    maxBranches: 5,
    maxStaff: 50,
    maxTables: 120,
    customDomainEnabled: true,
    advancedBrandingEnabled: true,
    analyticsEnabled: true,
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    tier: 'ENTERPRISE' as const,
    description: 'Unlimited scale white-label SaaS with priority SLA',
    monthlyPriceInr: 999900, // Rs 9,999
    annualPriceInr: 9999000, // Rs 99,990
    maxBranches: 50,
    maxStaff: 500,
    maxTables: 1000,
    customDomainEnabled: true,
    advancedBrandingEnabled: true,
    analyticsEnabled: true,
  },
];

async function main() {
  console.log('[Seed] Seeding permissions...');
  const permMap = new Map<string, string>();
  for (const p of PERMISSIONS) {
    const upserted = await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, description: p.description },
      create: p,
    });
    permMap.set(p.code, upserted.id);
  }

  console.log('[Seed] Seeding global system roles...');
  for (const [code, roleDef] of Object.entries(SYSTEM_ROLES)) {
    let role = await prisma.role.findFirst({
      where: { restaurantId: null, code },
    });
    if (!role) {
      role = await prisma.role.create({
        data: {
          restaurantId: null,
          code,
          name: roleDef.name,
          description: roleDef.description,
          isSystem: true,
        },
      });
    }

    for (const permCode of roleDef.permissions) {
      const permId = permMap.get(permCode);
      if (!permId) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permId },
        },
        update: {},
        create: { roleId: role.id, permissionId: permId },
      });
    }
  }

  console.log('[Seed] Seeding subscription plans...');
  for (const plan of PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan,
    });
  }

  // Seed default Super Admin only in non-production if configured or for initial local setup
  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL || 'superadmin@restaurantos.app';
  const superAdminPass = process.env.SEED_SUPER_ADMIN_PASSWORD || 'SuperAdmin@12345';
  const existingAdmin = await prisma.user.findUnique({ where: { email: superAdminEmail } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(superAdminPass, 12);
    await prisma.user.create({
      data: {
        email: superAdminEmail,
        fullName: 'Platform Super Admin',
        passwordHash,
        isSuperAdmin: true,
        emailVerified: true,
      },
    });
    console.log(`[Seed] Created Super Admin: ${superAdminEmail}`);
  }

  console.log('[Seed] Done.');
}

main()
  .catch((e) => {
    console.error('[Seed] Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
