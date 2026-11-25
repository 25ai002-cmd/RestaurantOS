import { PrismaClient, Prisma } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

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
