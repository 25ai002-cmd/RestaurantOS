import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Lock } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import { useAuthStore, type ActiveRestaurant, type AuthUser } from '../stores/authStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    try {
      const loginData = await apiFetch<{
        accessToken: string;
        user: AuthUser;
      }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(values),
      });

      useAuthStore.getState().setAccessToken(loginData.accessToken);
      const me = await apiFetch<{
        user: AuthUser;
        activeRestaurant: ActiveRestaurant | null;
      }>('/api/v1/auth/me');

      setSession({
        accessToken: loginData.accessToken,
        user: me.user,
        activeRestaurant: me.activeRestaurant,
      });

      if (me.user.isSuperAdmin && !me.activeRestaurant) {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Unable to sign in');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Building2 className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">
            Sign in to RestaurantOS
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Multi-tenant restaurant operations & white-label console
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {serverError}
              </div>
            )}

            <Input
              label="Work Email"
              type="email"
              placeholder="owner@grandkitchen.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />

            <Button type="submit" className="w-full" loading={isSubmitting}>
              <Lock className="h-4 w-4" />
              Sign In
            </Button>
          </form>
        </Card>

        <p className="text-center text-xs text-slate-500">
          New restaurant on RestaurantOS?{' '}
          <Link to="/register" className="font-medium text-slate-900 hover:underline">
            Create your tenant workspace
          </Link>
        </p>
      </div>
    </div>
  );
};
