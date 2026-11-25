import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plus, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface TableRow {
  id: string;
  tableNumber: string;
  capacity: number;
  qrToken: string;
  status: string;
  branch: { id: string; name: string };
}

interface MenuCategory {
  id: string;
  name: string;
  products: {
    id: string;
    name: string;
    basePriceInr: number;
    dietaryType: string;
    isAvailable: boolean;
  }[];
}

export const TablesTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState('4');

  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const data = await apiFetch<{ branches: Branch[] }>('/api/v1/branches');
      if (!branchId && data.branches[0]) setBranchId(data.branches[0].id);
      return data.branches;
    },
  });

  const tablesQuery = useQuery({
    queryKey: ['tables'],
    queryFn: () => apiFetch<{ tables: TableRow[] }>('/api/v1/tables'),
  });

  const createTable = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/tables', {
        method: 'POST',
        body: JSON.stringify({
          branchId: branchId || branchesQuery.data?.[0]?.id,
          tableNumber,
          capacity: Number(capacity),
        }),
      }),
    onSuccess: () => {
      setTableNumber('');
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    },
  });

  const rotateQr = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/tables/${id}/rotate-qr`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tables'] }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Add Dining Table" description="Generates a revocable public QR ordering token." />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createTable.mutate();
          }}
          className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-4 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Branch</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              {branchesQuery.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Table Number"
            placeholder="T-01"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            required
          />
          <Input
            label="Capacity"
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            required
          />
          <Button type="submit" loading={createTable.isPending}>
            <Plus className="h-4 w-4" />
            Create Table
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Tables & QR Ordering Links" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Table</th>
                <th className="px-5 py-3 font-medium">Branch</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Customer QR Link</th>
                <th className="px-5 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tablesQuery.data?.tables.map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-3 font-medium text-slate-900">
                    {t.tableNumber} ({t.capacity} seats)
                  </td>
                  <td className="px-5 py-3 text-slate-700">{t.branch.name}</td>
                  <td className="px-5 py-3">
                    <Badge tone={t.status === 'AVAILABLE' ? 'success' : 'warning'}>{t.status}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      to={`/q/${t.qrToken}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-slate-900 underline"
                    >
                      Open QR Menu <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <Button size="sm" variant="secondary" onClick={() => rotateQr.mutate(t.id)}>
                      <RefreshCw className="h-3 w-3" />
                      Rotate QR
                    </Button>
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

export const MenuTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [catName, setCatName] = useState('');
  const [prodCatId, setProdCatId] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodPriceRupees, setProdPriceRupees] = useState('');
  const [dietaryType, setDietaryType] = useState<'VEG' | 'NON_VEG' | 'VEGAN'>('VEG');

  const menuQuery = useQuery({
    queryKey: ['tenant-menu'],
    queryFn: async () => {
      const data = await apiFetch<{ categories: MenuCategory[] }>('/api/v1/menu');
      if (!prodCatId && data.categories[0]) setProdCatId(data.categories[0].id);
      return data.categories;
    },
  });

  const createCategory = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/menu/categories', {
        method: 'POST',
        body: JSON.stringify({ name: catName }),
      }),
    onSuccess: () => {
      setCatName('');
      queryClient.invalidateQueries({ queryKey: ['tenant-menu'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    },
  });

  const createProduct = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/menu/products', {
        method: 'POST',
        body: JSON.stringify({
          categoryId: prodCatId || menuQuery.data?.[0]?.id,
          name: prodName,
          basePriceInr: Math.round(Number(prodPriceRupees) * 100),
          dietaryType,
        }),
      }),
    onSuccess: () => {
      setProdName('');
      setProdPriceRupees('');
      queryClient.invalidateQueries({ queryKey: ['tenant-menu'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    },
  });

  const toggleAvailability = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      apiFetch(`/api/v1/menu/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant-menu'] }),
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Add Menu Category" />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createCategory.mutate();
            }}
            className="flex gap-3 p-6 items-end"
          >
            <div className="flex-1">
              <Input
                label="Category Name"
                placeholder="Starters"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                required
              />
            </div>
            <Button type="submit" loading={createCategory.isPending}>
              Add Category
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Add Menu Item" />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createProduct.mutate();
            }}
            className="grid grid-cols-2 gap-3 p-6 items-end"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Category</label>
              <select
                value={prodCatId}
                onChange={(e) => setProdCatId(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                {menuQuery.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Item Name"
              placeholder="Paneer Tikka"
              value={prodName}
              onChange={(e) => setProdName(e.target.value)}
              required
            />
            <Input
              label="Price (INR ₹)"
              type="number"
              step="0.01"
              min="1"
              placeholder="280"
              value={prodPriceRupees}
              onChange={(e) => setProdPriceRupees(e.target.value)}
              required
            />
            <div className="flex gap-2 items-end">
              <select
                value={dietaryType}
                onChange={(e) => setDietaryType(e.target.value as 'VEG' | 'NON_VEG' | 'VEGAN')}
                className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="VEG">Veg</option>
                <option value="NON_VEG">Non-Veg</option>
                <option value="VEGAN">Vegan</option>
              </select>
              <Button type="submit" loading={createProduct.isPending}>
                Add
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <Card>
        <CardHeader title="Menu Catalog" />
        <div className="divide-y divide-slate-100">
          {menuQuery.data?.map((cat) => (
            <div key={cat.id} className="p-6 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {cat.name}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cat.products.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs"
                  >
                    <div>
                      <div className="font-medium text-slate-900">{p.name}</div>
                      <div className="text-slate-500">
                        ₹{(p.basePriceInr / 100).toFixed(2)} • {p.dietaryType}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={p.isAvailable ? 'secondary' : 'danger'}
                      onClick={() =>
                        toggleAvailability.mutate({ id: p.id, isAvailable: !p.isAvailable })
                      }
                    >
                      {p.isAvailable ? 'Available' : 'Sold Out'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
