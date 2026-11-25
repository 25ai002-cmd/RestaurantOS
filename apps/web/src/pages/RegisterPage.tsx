import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, ArrowRight } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import { useAuthStore, type ActiveRestaurant, type AuthUser } from '../stores/authStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';

const registerSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().min(8, 'Phone number is required').optional().or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  restaurantName: z.string().min(2, 'Restaurant name is required'),
  restaurantSlug: z
    .string()
    .regex(/^[a-z0-9-]*$/, 'Lowercase letters, numbers, and hyphens only')
    .optional(),
});

type RegisterForm = z.infer<typeof registerSchema>;

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (values: RegisterForm) => {
    setServerError(null);
    try {
      const payload = {
        ...values,
        phone: values.phone || undefined,
        restaurantSlug: values.restaurantSlug || undefined,
      };
      const res = await apiFetch<{
        accessToken: string;
        user: AuthUser;
      }>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      useAuthStore.getState().setAccessToken(res.accessToken);
      const me = await apiFetch<{
        user: AuthUser;
        activeRestaurant: ActiveRestaurant | null;
      }>('/api/v1/auth/me');

      setSession({
        accessToken: res.accessToken,
        user: me.user,
        activeRestaurant: me.activeRestaurant,
      });

      navigate('/dashboard');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Registration failed');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Building2 className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">
            Create your RestaurantOS workspace
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Isolated multi-tenant SaaS environment with white-label storefront
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {serverError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Owner Full Name"
                placeholder="Arjun Mehta"
                error={errors.fullName?.message}
                {...register('fullName')}
              />
              <Input
                label="Phone Number"
                placeholder="+91 98765 43210"
                error={errors.phone?.message}
                {...register('phone')}
              />
            </div>

            <Input
              label="Work Email"
              type="email"
              placeholder="arjun@grandkitchen.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Password"
              type="password"
              placeholder="Minimum 8 characters"
              error={errors.password?.message}
              {...register('password')}
            />

            <div className="border-t border-slate-100 pt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Restaurant Name"
                  placeholder="The Grand Kitchen"
                  error={errors.restaurantName?.message}
                  {...register('restaurantName')}
                />
                <Input
                  label="Subdomain Slug (optional)"
                  placeholder="the-grand-kitchen"
                  error={errors.restaurantSlug?.message}
                  {...register('restaurantSlug')}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" loading={isSubmitting}>
              Create Workspace
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </Card>

        <p className="text-center text-xs text-slate-500">
          Already registered?{' '}
          <Link to="/login" className="font-medium text-slate-900 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};
