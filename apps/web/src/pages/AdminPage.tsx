import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

interface AdminRestaurantRow {
  id: string;
  name: string;
  slug: string;
  status: 'PENDING_ONBOARDING' | 'ACTIVE' | 'SUSPENDED' | 'READ_ONLY';
  contactEmail: string;
  createdAt: string;
  _count: {
    branches: number;
    restaurantUsers: number;
  };
}

export const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, clearSession } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-restaurants'],
    queryFn: () => apiFetch<{ restaurants: AdminRestaurantRow[] }>('/api/v1/admin/restaurants'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AdminRestaurantRow['status'] }) =>
      apiFetch(`/api/v1/admin/restaurants/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-restaurants'] });
    },
  });

  const handleLogout = async () => {
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      clearSession();
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">
                RestaurantOS Platform Control Plane
              </h1>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Card>
          <CardHeader
            title="Registered Tenants"
            description="Platform-level tenant lifecycle management."
          />
          <div className="overflow-x-auto">
            {isLoading ? (
              <p className="p-6 text-xs text-slate-500">Loading platform tenants...</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Restaurant</th>
                    <th className="px-6 py-3 font-medium">Owner Email</th>
                    <th className="px-6 py-3 font-medium">Branches / Staff</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.restaurants.map((r) => (
                    <tr key={r.id}>
                      <td className="px-6 py-3">
                        <div className="font-medium text-slate-900">{r.name}</div>
                        <div className="text-[11px] text-slate-500">{r.slug}.restaurantos.app</div>
                      </td>
                      <td className="px-6 py-3 text-slate-700">{r.contactEmail}</td>
                      <td className="px-6 py-3 text-slate-700">
                        {r._count.branches} branches / {r._count.restaurantUsers} staff
                      </td>
                      <td className="px-6 py-3">
                        <Badge
                          tone={
                            r.status === 'ACTIVE'
                              ? 'success'
                              : r.status === 'SUSPENDED'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3">
                        <Button
                          size="sm"
                          variant={r.status === 'SUSPENDED' ? 'secondary' : 'danger'}
                          onClick={() =>
                            updateStatus.mutate({
                              id: r.id,
                              status: r.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
                            })
                          }
                        >
                          {r.status === 'SUSPENDED' ? 'Activate' : 'Suspend'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
};
