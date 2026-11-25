import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../../lib/api';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';

interface DomainRow {
  id: string;
  hostname: string;
  domainType: string;
  status: string;
  verificationToken: string;
  isActive: boolean;
}

interface PlanRow {
  id: string;
  code: string;
  name: string;
  monthlyPriceInr: number;
  customDomainEnabled: boolean;
}

export const SettingsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [hostname, setHostname] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const domainsQuery = useQuery({
    queryKey: ['tenant-domains'],
    queryFn: () => apiFetch<{ domains: DomainRow[] }>('/api/v1/domains'),
  });

  const plansQuery = useQuery({
    queryKey: ['saas-plans'],
    queryFn: () => apiFetch<{ plans: PlanRow[] }>('/api/v1/subscriptions/plans'),
  });

  const currentSubQuery = useQuery({
    queryKey: ['current-subscription'],
    queryFn: () =>
      apiFetch<{ subscription: { plan: PlanRow; status: string; currentPeriodEnd: string } | null }>(
        '/api/v1/subscriptions/current',
      ),
  });

  const addDomain = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/domains', {
        method: 'POST',
        body: JSON.stringify({ hostname }),
      }),
    onSuccess: () => {
      setHostname('');
      setMsg('Custom domain added. Verify DNS to activate.');
      queryClient.invalidateQueries({ queryKey: ['tenant-domains'] });
    },
    onError: (err) => setMsg(err instanceof ApiError ? err.message : 'Failed to add domain'),
  });

  const verifyDomain = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/domains/${id}/verify`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant-domains'] }),
  });

  const changePlan = useMutation({
    mutationFn: (planId: string) =>
      apiFetch('/api/v1/subscriptions/change-plan', {
        method: 'POST',
        body: JSON.stringify({ planId, billingCycle: 'MONTHLY' }),
      }),
    onSuccess: () => {
      setMsg('Subscription plan updated.');
      queryClient.invalidateQueries({ queryKey: ['current-subscription'] });
    },
  });

  return (
    <div className="space-y-6">
      {msg && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-700">
          {msg}
        </div>
      )}

      <Card>
        <CardHeader
          title="White-Label Domains"
          description="Manage your RestaurantOS subdomain and verified custom domains."
        />
        <div className="p-6 space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addDomain.mutate();
            }}
            className="flex gap-3 items-end"
          >
            <div className="flex-1">
              <Input
                label="Custom Domain"
                placeholder="order.yourrestaurant.com"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                required
              />
            </div>
            <Button type="submit" loading={addDomain.isPending}>
              Add Domain
            </Button>
          </form>

          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {domainsQuery.data?.domains.map((d) => (
              <div key={d.id} className="flex items-center justify-between p-3 text-xs">
                <div>
                  <div className="font-medium text-slate-900">{d.hostname}</div>
                  <div className="text-[11px] text-slate-500">
                    {d.domainType} • Token: {d.verificationToken}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={d.status === 'VERIFIED' ? 'success' : 'warning'}>{d.status}</Badge>
                  {d.status !== 'VERIFIED' && (
                    <Button size="sm" variant="secondary" onClick={() => verifyDomain.mutate(d.id)}>
                      Verify
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="RestaurantOS SaaS Subscription"
          description={
            currentSubQuery.data?.subscription
              ? `Current Plan: ${currentSubQuery.data.subscription.plan.name} (${currentSubQuery.data.subscription.status})`
              : 'Select a subscription plan'
          }
        />
        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
          {plansQuery.data?.plans.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{p.name}</span>
                {currentSubQuery.data?.subscription?.plan.id === p.id && (
                  <Badge tone="success">Current</Badge>
                )}
              </div>
              <div className="text-xl font-bold text-slate-900">
                ₹{(p.monthlyPriceInr / 100).toFixed(0)}
                <span className="text-xs font-normal text-slate-500"> /mo</span>
              </div>
              <p className="text-xs text-slate-500">
                Custom Domain: {p.customDomainEnabled ? 'Included' : 'Not included'}
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => changePlan.mutate(p.id)}
              >
                Select {p.name}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
