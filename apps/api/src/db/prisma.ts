import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

/**
 * Executes a callback inside a PostgreSQL transaction with
 * `app.current_restaurant_id` set locally for Row-Level Security (RLS).
 */
export async function withTenantScope<T>(
  restaurantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_restaurant_id', ${restaurantId}, true)`;
    return fn(tx);
  });
}
