import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const localEnv = path.resolve(process.cwd(), '.env');
const rootEnvLocal = path.resolve(process.cwd(), '.env.local');
const monorepoRootEnvLocal = path.resolve(process.cwd(), '../../.env.local');
const monorepoApiEnv = path.resolve(process.cwd(), 'apps/api/.env');

for (const candidate of [rootEnvLocal, monorepoRootEnvLocal, localEnv, monorepoApiEnv]) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  PLATFORM_BASE_DOMAIN: z.string().default('restaurantos.app'),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOriginsList: parsed.data.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
