import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ChefHat,
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  QrCode,
  Receipt,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { OverviewTab } from '../components/dashboard/OverviewTab';
import { OrdersKdsTab } from '../components/dashboard/OrdersKdsTab';
import { MenuTab, TablesTab } from '../components/dashboard/TablesMenuTab';
import { BillingTab } from '../components/dashboard/BillingTab';
import { SettingsTab } from '../components/dashboard/SettingsTab';

type TabKey = 'overview' | 'orders' | 'kds' | 'tables' | 'menu' | 'billing' | 'staff' | 'settings';

interface StaffMember {
  id: string;
  status: string;
  user: { id: string; fullName: string; email: string };
  role: { code: string; name: string };
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, activeRestaurant, clearSession } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRole, setStaffRole] = useState<'MANAGER' | 'KITCHEN_STAFF' | 'CASHIER' | 'WAITER'>('WAITER');
  const [staffMsg, setStaffMsg] = useState<string | null>(null);

  const permissions = new Set(activeRestaurant?.permissions || []);
  const canReadStaff = permissions.has('staff:read');
  const canWriteStaff = permissions.has('staff:write');

  const profileQuery = useQuery({
    queryKey: ['restaurant-profile', activeRestaurant?.id],
    queryFn: () =>
      apiFetch<{ restaurant: { id: string; name: string; slug: string; status: string } }>(
        '/api/v1/restaurant/profile',
      ),
    enabled: Boolean(activeRestaurant?.id),
  });

  const staffQuery = useQuery({
    queryKey: ['restaurant-staff', activeRestaurant?.id],
    queryFn: () => apiFetch<{ staff: StaffMember[] }>('/api/v1/staff'),
    enabled: Boolean(activeRestaurant?.id) && canReadStaff && activeTab === 'staff',
  });

  const addStaff = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/staff', {
        method: 'POST',
        body: JSON.stringify({
          fullName: staffName,
          email: staffEmail,
          password: staffPassword,
          roleCode: staffRole,
        }),
      }),
    onSuccess: () => {
      setStaffName('');
      setStaffEmail('');
      setStaffPassword('');
      setStaffMsg('Staff member added.');
      queryClient.invalidateQueries({ queryKey: ['restaurant-staff'] });
    },
    onError: (err) => setStaffMsg(err instanceof ApiError ? err.message : 'Failed to add staff'),
  });

  const handleLogout = async () => {
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      clearSession();
      navigate('/login');
    }
  };

  const restaurant = profileQuery.data?.restaurant;

  const navItems: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
    { key: 'orders', label: 'Live Orders', icon: <ClipboardList className="h-4 w-4" /> },
    { key: 'kds', label: 'Kitchen Display', icon: <ChefHat className="h-4 w-4" /> },
    { key: 'tables', label: 'Tables & QR', icon: <QrCode className="h-4 w-4" /> },
    { key: 'menu', label: 'Menu', icon: <UtensilsCrossed className="h-4 w-4" /> },
    { key: 'billing', label: 'Billing', icon: <Receipt className="h-4 w-4" /> },
    { key: 'staff', label: 'Staff', icon: <Users className="h-4 w-4" /> },
    { key: 'settings', label: 'Settings & Plan', icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-60 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              {restaurant?.name || activeRestaurant?.name || 'RestaurantOS'}
            </div>
            <div className="truncate text-[11px] text-slate-500">{activeRestaurant?.roleName}</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === item.key
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-3 space-y-1.5">
          {restaurant?.slug && (
            <Link
              to={`/r/${restaurant.slug}`}
              target="_blank"
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <span>Storefront</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          {user?.isSuperAdmin && (
            <Link
              to="/admin"
              className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Super Admin
            </Link>
          )}
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleLogout}>
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-semibold text-slate-900">
              {navItems.find((i) => i.key === activeTab)?.label}
            </h1>
            <Badge tone={(restaurant?.status || activeRestaurant?.status) === 'ACTIVE' ? 'success' : 'warning'}>
              {restaurant?.status || activeRestaurant?.status}
            </Badge>
          </div>
          <div className="text-xs text-slate-500">{user?.fullName}</div>
        </header>

        <main className="flex-1 p-6 max-w-6xl w-full mx-auto">
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'orders' && <OrdersKdsTab mode="orders" />}
          {activeTab === 'kds' && <OrdersKdsTab mode="kds" />}
          {activeTab === 'tables' && <TablesTab />}
          {activeTab === 'menu' && <MenuTab />}
          {activeTab === 'billing' && <BillingTab />}
          {activeTab === 'settings' && <SettingsTab />}
          {activeTab === 'staff' && (
            <Card>
              <CardHeader title="Staff Directory" description="Server-side RBAC permissions per role" />
              <div className="p-6 space-y-5">
                {staffMsg && <p className="text-xs text-slate-700">{staffMsg}</p>}
                {!canReadStaff ? (
                  <p className="text-xs text-slate-500">Missing staff:read permission.</p>
                ) : (
                  <>
                    <table className="w-full text-left text-xs border rounded-lg overflow-hidden">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Name</th>
                          <th className="px-4 py-2.5 font-medium">Email</th>
                          <th className="px-4 py-2.5 font-medium">Role</th>
                          <th className="px-4 py-2.5 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {staffQuery.data?.staff.map((s) => (
                          <tr key={s.id}>
                            <td className="px-4 py-2.5 font-medium text-slate-900">{s.user.fullName}</td>
                            <td className="px-4 py-2.5 text-slate-600">{s.user.email}</td>
                            <td className="px-4 py-2.5 text-slate-700">{s.role.name}</td>
                            <td className="px-4 py-2.5">
                              <Badge tone="success">{s.status}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {canWriteStaff && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          addStaff.mutate();
                        }}
                        className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-5 items-end"
                      >
                        <Input
                          label="Name"
                          value={staffName}
                          onChange={(e) => setStaffName(e.target.value)}
                          required
                        />
                        <Input
                          label="Email"
                          type="email"
                          value={staffEmail}
                          onChange={(e) => setStaffEmail(e.target.value)}
                          required
                        />
                        <Input
                          label="Password"
                          type="password"
                          value={staffPassword}
                          onChange={(e) => setStaffPassword(e.target.value)}
                          required
                        />
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1.5">Role</label>
                          <select
                            value={staffRole}
                            onChange={(e) =>
                              setStaffRole(
                                e.target.value as 'MANAGER' | 'KITCHEN_STAFF' | 'CASHIER' | 'WAITER',
                              )
                            }
                            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                          >
                            <option value="MANAGER">Manager</option>
                            <option value="KITCHEN_STAFF">Kitchen Staff</option>
                            <option value="CASHIER">Cashier</option>
                            <option value="WAITER">Waiter</option>
                          </select>
                        </div>
                        <Button type="submit" loading={addStaff.isPending}>
                          <UserPlus className="h-4 w-4" />
                          Add Staff
                        </Button>
                      </form>
                    )}
                  </>
                )}
              </div>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
};
