import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../../lib/api';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface ActiveSession {
  id: string;
  sessionCode: string;
  table: { tableNumber: string };
  orders: { id: string; orderNumber: string; totalInr: number; customerId: string }[];
}

interface BillRow {
  id: string;
  invoiceNumber: string;
  billType: string;
  status: string;
  totalInr: number;
  tableSession: { table: { tableNumber: string } };
}

export const BillingTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ['active-sessions'],
    queryFn: () => apiFetch<{ sessions: ActiveSession[] }>('/api/v1/sessions/active'),
  });

  const billsQuery = useQuery({
    queryKey: ['tenant-bills'],
    queryFn: () => apiFetch<{ bills: BillRow[] }>('/api/v1/bills'),
  });

  const createCombinedBill = useMutation({
    mutationFn: (tableSessionId: string) =>
      apiFetch('/api/v1/bills/draft', {
        method: 'POST',
        body: JSON.stringify({ tableSessionId, billType: 'COMBINED' }),
      }),
    onSuccess: () => {
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ['tenant-bills'] });
    },
    onError: (err) => setErrorMsg(err instanceof ApiError ? err.message : 'Failed to create bill'),
  });

  const approveBill = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/bills/${id}/approve`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant-bills'] }),
  });

  const markCashPaid = useMutation({
    mutationFn: ({ billId, amountInr }: { billId: string; amountInr: number }) =>
      apiFetch('/api/v1/payments/offline', {
        method: 'POST',
        body: JSON.stringify({ billId, method: 'CASH', amountInr }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-bills'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-overview'] });
    },
  });

  const closeSession = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/sessions/${id}/close`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['active-sessions'] }),
  });

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      <Card>
        <CardHeader title="Active Table Sessions" description="Generate combined bills or close sessions" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Table</th>
                <th className="px-5 py-3 font-medium">Session</th>
                <th className="px-5 py-3 font-medium">Orders</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessionsQuery.data?.sessions.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3 font-medium text-slate-900">Table {s.table.tableNumber}</td>
                  <td className="px-5 py-3 text-slate-600">{s.sessionCode}</td>
                  <td className="px-5 py-3 text-slate-700">{s.orders.length} orders</td>
                  <td className="px-5 py-3 space-x-2">
                    <Button size="sm" onClick={() => createCombinedBill.mutate(s.id)}>
                      Generate Combined Bill
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => closeSession.mutate(s.id)}>
                      Close Session
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Bills & Invoices" description="Admin-approved billing with immutable snapshots" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Invoice #</th>
                <th className="px-5 py-3 font-medium">Table</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {billsQuery.data?.bills.map((b) => (
                <tr key={b.id}>
                  <td className="px-5 py-3 font-medium text-slate-900">{b.invoiceNumber}</td>
                  <td className="px-5 py-3 text-slate-700">Table {b.tableSession.table.tableNumber}</td>
                  <td className="px-5 py-3 text-slate-700">{b.billType}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">
                    ₹{(b.totalInr / 100).toFixed(2)}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={b.status === 'PAID' ? 'success' : 'warning'}>{b.status}</Badge>
                  </td>
                  <td className="px-5 py-3 space-x-2">
                    {b.status === 'DRAFT' && (
                      <Button size="sm" onClick={() => approveBill.mutate(b.id)}>
                        Approve Bill
                      </Button>
                    )}
                    {b.status === 'APPROVED' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => markCashPaid.mutate({ billId: b.id, amountInr: b.totalInr })}
                      >
                        Record Cash Paid
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
