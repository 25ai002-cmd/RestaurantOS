import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Rocket } from 'lucide-react';
import { apiFetch, ApiError } from '../../lib/api';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface AnalyticsOverview {
  totalRevenueInr: number;
  totalOrders: number;
  pendingOrders: number;
  activeTables: number;
  pendingBills: number;
  averageOrderValueInr: number;
  averageRating: number | null;
  feedbackCount: number;
  popularItems: { name: string; quantity: number; revenueInr: number }[];
}

interface OnboardingStatus {
  restaurantStatus: string;
  readyToActivate: boolean;
  checklist: {
    hasProfileDetails: boolean;
    hasBranch: boolean;
    hasTable: boolean;
    hasCategory: boolean;
    hasProduct: boolean;
    hasStaff: boolean;
  };
}

const formatInr = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

export const OverviewTab: React.FC = () => {
  const queryClient = useQueryClient();

  const analyticsQuery = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => apiFetch<AnalyticsOverview>('/api/v1/analytics/overview'),
  });

  const onboardingQuery = useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => apiFetch<OnboardingStatus>('/api/v1/onboarding/status'),
  });

  const activateMutation = useMutation({
    mutationFn: () => apiFetch('/api/v1/onboarding/activate', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-profile'] });
    },
  });

  const stats = analyticsQuery.data;
  const ob = onboardingQuery.data;

  return (
    <div className="space-y-6">
      {ob && ob.restaurantStatus !== 'ACTIVE' && (
        <Card>
          <CardHeader
            title="Restaurant Onboarding Checklist"
            description="Complete at least 1 branch, 1 table, 1 category, and 1 product to activate your live storefront."
            action={<Badge tone="warning">{ob.restaurantStatus}</Badge>}
          />
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 text-xs">
              {[
                ['Branch configured', ob.checklist.hasBranch],
                ['Table & QR created', ob.checklist.hasTable],
                ['Menu category added', ob.checklist.hasCategory],
                ['Menu product added', ob.checklist.hasProduct],
                ['Staff member added', ob.checklist.hasStaff],
                ['Profile contact details', ob.checklist.hasProfileDetails],
              ].map(([label, done]) => (
                <div key={String(label)} className="flex items-center gap-2 text-slate-700">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Circle className="h-4 w-4 text-slate-300" />
                  )}
                  <span>{label}</span>
                </div>
              ))}
            </div>
            {activateMutation.error && (
              <p className="text-xs text-red-600">
                {activateMutation.error instanceof ApiError
                  ? activateMutation.error.message
                  : 'Activation failed'}
              </p>
            )}
            <Button
              size="sm"
              disabled={!ob.readyToActivate}
              loading={activateMutation.isPending}
              onClick={() => activateMutation.mutate()}
            >
              <Rocket className="h-3.5 w-3.5" />
              Activate Restaurant
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total Revenue', value: stats ? formatInr(stats.totalRevenueInr) : '—' },
          { label: 'Total Orders', value: stats ? String(stats.totalOrders) : '—' },
          { label: 'Active Tables', value: stats ? String(stats.activeTables) : '—' },
          { label: 'Pending Orders', value: stats ? String(stats.pendingOrders) : '—' },
        ].map((metric) => (
          <Card key={metric.label} className="p-5">
            <div className="text-xs font-medium text-slate-500">{metric.label}</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              {metric.value}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Popular Menu Items" description="Top ordered items by quantity" />
          <div className="p-6">
            {stats?.popularItems.length ? (
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500 border-b">
                  <tr>
                    <th className="pb-2 font-medium">Item</th>
                    <th className="pb-2 font-medium">Qty</th>
                    <th className="pb-2 font-medium text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.popularItems.map((item) => (
                    <tr key={item.name}>
                      <td className="py-2.5 font-medium text-slate-900">{item.name}</td>
                      <td className="py-2.5 text-slate-600">{item.quantity}</td>
                      <td className="py-2.5 text-right text-slate-900">
                        {formatInr(item.revenueInr)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-slate-500">No orders recorded yet.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Order & Feedback Summary" />
          <div className="p-6 space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Average Order Value</span>
              <span className="font-medium text-slate-900">
                {stats ? formatInr(stats.averageOrderValueInr) : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Pending Bills</span>
              <span className="font-medium text-slate-900">{stats?.pendingBills ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Customer Rating</span>
              <span className="font-medium text-slate-900">
                {stats?.averageRating ? `${stats.averageRating} / 5 (${stats.feedbackCount})` : 'No ratings yet'}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
