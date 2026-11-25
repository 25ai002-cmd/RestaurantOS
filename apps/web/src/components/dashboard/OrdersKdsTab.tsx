import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface OrderRow {
  id: string;
  orderNumber: string;
  status: 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
  totalInr: number;
  specialInstructions: string | null;
  createdAt: string;
  tableSession: { table: { tableNumber: string } };
  customer: { fullName: string | null; phone: string };
  items: { id: string; productNameSnap: string; variantNameSnap: string | null; quantity: number }[];
}

const NEXT_STATUS: Record<string, { label: string; next: OrderRow['status'] } | undefined> = {
  PLACED: { label: 'Accept', next: 'ACCEPTED' },
  ACCEPTED: { label: 'Start Preparing', next: 'PREPARING' },
  PREPARING: { label: 'Mark Ready', next: 'READY' },
  READY: { label: 'Mark Served', next: 'SERVED' },
};

export const OrdersKdsTab: React.FC<{ mode: 'orders' | 'kds' }> = ({ mode }) => {
  const queryClient = useQueryClient();

  const ordersQuery = useQuery({
    queryKey: ['tenant-orders'],
    queryFn: () => apiFetch<{ orders: OrderRow[] }>('/api/v1/orders'),
    refetchInterval: 5000,
  });

  const transition = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderRow['status'] }) =>
      apiFetch(`/api/v1/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-orders'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-overview'] });
    },
  });

  const orders = (ordersQuery.data?.orders || []).filter((o) =>
    mode === 'kds' ? ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status) : true,
  );

  if (mode === 'kds') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Kitchen Display System (Live)</h2>
          <span className="text-xs text-slate-500">Auto-refreshes every 5s</span>
        </div>
        {orders.length === 0 ? (
          <Card className="p-8 text-center text-xs text-slate-500">No active kitchen tickets.</Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {orders.map((o) => {
              const action = NEXT_STATUS[o.status];
              return (
                <Card key={o.id} className="border-2 border-slate-900 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-slate-900">
                      Table {o.tableSession.table.tableNumber}
                    </span>
                    <Badge tone={o.status === 'READY' ? 'success' : 'warning'}>{o.status}</Badge>
                  </div>
                  <div className="text-xs text-slate-500">{o.orderNumber}</div>
                  <ul className="space-y-1.5 border-y border-slate-100 py-3 text-sm font-medium text-slate-900">
                    {o.items.map((item) => (
                      <li key={item.id}>
                        {item.quantity}x {item.productNameSnap}
                        {item.variantNameSnap ? ` (${item.variantNameSnap})` : ''}
                      </li>
                    ))}
                  </ul>
                  {o.specialInstructions && (
                    <p className="rounded bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                      Note: {o.specialInstructions}
                    </p>
                  )}
                  {action && (
                    <Button
                      className="w-full"
                      onClick={() => transition.mutate({ id: o.id, status: action.next })}
                      loading={transition.isPending}
                    >
                      {action.label}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader title="Live & Historical Orders" description="Validated state transitions only" />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Order</th>
              <th className="px-5 py-3 font-medium">Table / Customer</th>
              <th className="px-5 py-3 font-medium">Items</th>
              <th className="px-5 py-3 font-medium">Total</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((o) => {
              const action = NEXT_STATUS[o.status];
              return (
                <tr key={o.id}>
                  <td className="px-5 py-3 font-medium text-slate-900">{o.orderNumber}</td>
                  <td className="px-5 py-3 text-slate-700">
                    Table {o.tableSession.table.tableNumber}
                    <div className="text-[11px] text-slate-500">
                      {o.customer.fullName || o.customer.phone}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {o.items.map((i) => `${i.quantity}x ${i.productNameSnap}`).join(', ')}
                  </td>
                  <td className="px-5 py-3 font-medium text-slate-900">
                    ₹{(o.totalInr / 100).toFixed(2)}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={o.status === 'SERVED' ? 'success' : o.status === 'CANCELLED' ? 'danger' : 'warning'}>
                      {o.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 space-x-2">
                    {action && (
                      <Button
                        size="sm"
                        onClick={() => transition.mutate({ id: o.id, status: action.next })}
                      >
                        {action.label}
                      </Button>
                    )}
                    {['PLACED', 'ACCEPTED', 'PREPARING'].includes(o.status) && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => transition.mutate({ id: o.id, status: 'CANCELLED' })}
                      >
                        Reject
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
