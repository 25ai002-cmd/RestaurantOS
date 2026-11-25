import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(255).toLowerCase(),
  phone: z.string().trim().min(8).max(20).optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100),
  restaurantName: z.string().trim().min(2).max(150),
  restaurantSlug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens')
    .min(2)
    .max(64)
    .optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(255).toLowerCase(),
  password: z.string().min(1),
  restaurantId: z.string().uuid().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
