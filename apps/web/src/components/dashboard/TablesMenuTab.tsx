import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plus, RefreshCw, CheckSquare } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { PRESET_DISHES } from '../../data/presetDishes';
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
    description: string | null;
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
  const [selectedDishes, setSelectedDishes] = useState<Record<string, number>>({});
  const [presetFilterCat, setPresetFilterCat] = useState<string>('ALL');
  const [presetFilterDiet, setPresetFilterDiet] = useState<'ALL' | 'VEG' | 'NON_VEG'>('ALL');
  const [presetSearch, setPresetSearch] = useState('');
  const [unlimitedMode, setUnlimitedMode] = useState(false);
  const [unlimitedName, setUnlimitedName] = useState('Unlimited Thali');
  const [unlimitedPriceRupees, setUnlimitedPriceRupees] = useState('399');
  const [unlimitedIncludedIds, setUnlimitedIncludedIds] = useState<Record<string, boolean>>({});
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);

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

  const bulkImport = useMutation({
    mutationFn: () => {
      const items = PRESET_DISHES.filter((d) => selectedDishes[d.id] !== undefined).map((d) => ({
        categoryName: d.categoryName,
        name: d.name,
        basePriceInr: Math.round((selectedDishes[d.id] ?? d.defaultPriceRupees) * 100),
        dietaryType: d.dietaryType,
      }));
      return apiFetch<{ createdCount: number }>('/api/v1/menu/bulk-import', {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
    },
    onSuccess: (res) => {
      setSelectedDishes({});
      setBulkSuccessMsg(`Added ${res.createdCount} new dish(es) to your menu.`);
      queryClient.invalidateQueries({ queryKey: ['tenant-menu'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    },
  });

  const createUnlimitedMeal = useMutation({
    mutationFn: () => {
      const includedDishes = PRESET_DISHES.filter((d) => unlimitedIncludedIds[d.id]);
      const hasNonVeg = includedDishes.some((d) => d.dietaryType === 'NON_VEG');
      const description = `Includes: ${includedDishes.map((d) => d.name).join(', ')}`;
      return apiFetch<{ createdCount: number }>('/api/v1/menu/bulk-import', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            {
              categoryName: 'Unlimited',
              name: unlimitedName.trim(),
              description,
              basePriceInr: Math.round(Number(unlimitedPriceRupees) * 100),
              dietaryType: hasNonVeg ? 'NON_VEG' : 'VEG',
            },
          ],
        }),
      });
    },
    onSuccess: () => {
      setUnlimitedIncludedIds({});
      setBulkSuccessMsg(`Added "${unlimitedName}" to Unlimited menu.`);
      queryClient.invalidateQueries({ queryKey: ['tenant-menu'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    },
  });

  const existingDishNames = new Set(
    (menuQuery.data || []).flatMap((c) => c.products.map((p) => p.name.toLowerCase())),
  );
  const presetCategories = ['ALL', 'Starter', 'Punjabi', 'Gujarati', 'Rice', 'Desserts', 'Drinks'];
  const filteredPresets = PRESET_DISHES.filter((d) => {
    const matchesCat = presetFilterCat === 'ALL' || d.categoryName === presetFilterCat;
    const matchesDiet = presetFilterDiet === 'ALL' || d.dietaryType === presetFilterDiet;
    const matchesSearch =
      !presetSearch.trim() || d.name.toLowerCase().includes(presetSearch.trim().toLowerCase());
    return matchesCat && matchesDiet && matchesSearch;
  });
  const selectedCount = Object.keys(selectedDishes).length;
  const unlimitedSelectedCount = Object.values(unlimitedIncludedIds).filter(Boolean).length;

  const toggleDishSelection = (id: string, defaultPrice: number) => {
    if (unlimitedMode) {
      setUnlimitedIncludedIds((prev) => ({ ...prev, [id]: !prev[id] }));
      return;
    }
    setSelectedDishes((prev) => {
      const next = { ...prev };
      if (next[id] !== undefined) {
        delete next[id];
      } else {
        next[id] = defaultPrice;
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={unlimitedMode ? 'Unlimited Meal Builder — Select Included Items' : 'Quick Menu Builder — Select Dishes'}
          description={
            unlimitedMode
              ? 'Check the dishes to include in your Unlimited Meal/Thali, set the meal name & fixed price, and save.'
              : 'Filter by Veg/Non-Veg or cuisine, check the dishes for your menu, and add them in one click.'
          }
          action={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={unlimitedMode ? 'primary' : 'secondary'}
                onClick={() => setUnlimitedMode((v) => !v)}
              >
                {unlimitedMode ? 'Exit Unlimited Builder' : 'Build Unlimited Meal'}
              </Button>
              {!unlimitedMode && (
                <Button
                  size="sm"
                  disabled={selectedCount === 0}
                  loading={bulkImport.isPending}
                  onClick={() => bulkImport.mutate()}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  Add Selected ({selectedCount})
                </Button>
              )}
            </div>
          }
        />
        <div className="p-6 space-y-4">
          {bulkSuccessMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {bulkSuccessMsg}
            </div>
          )}

          {unlimitedMode && (
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3 items-end">
              <Input
                label="Unlimited Meal Name"
                placeholder="Unlimited Punjabi Thali"
                value={unlimitedName}
                onChange={(e) => setUnlimitedName(e.target.value)}
              />
              <Input
                label="Fixed Price (INR ₹)"
                type="number"
                min={1}
                value={unlimitedPriceRupees}
                onChange={(e) => setUnlimitedPriceRupees(e.target.value)}
              />
              <Button
                disabled={unlimitedSelectedCount === 0 || !unlimitedName.trim()}
                loading={createUnlimitedMeal.isPending}
                onClick={() => createUnlimitedMeal.mutate()}
              >
                Create Unlimited Meal ({unlimitedSelectedCount} items)
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Veg / Non-Veg Filter */}
              <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
                {(['ALL', 'VEG', 'NON_VEG'] as const).map((diet) => (
                  <button
                    key={diet}
                    type="button"
                    onClick={() => setPresetFilterDiet(diet)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      presetFilterDiet === diet
                        ? diet === 'VEG'
                          ? 'bg-emerald-600 text-white'
                          : diet === 'NON_VEG'
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {diet === 'ALL' ? 'All Diet' : diet === 'VEG' ? 'Veg' : 'Non-Veg'}
                  </button>
                ))}
              </div>

              {/* Cuisine / Category Filter */}
              <div className="flex flex-wrap gap-1.5">
                {presetCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setPresetFilterCat(cat)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      presetFilterCat === cat
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {cat === 'ALL' ? 'All Categories' : cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search dishes..."
                value={presetSearch}
                onChange={(e) => setPresetSearch(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs focus:border-slate-900 focus:outline-none"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (unlimitedMode) {
                    const next = { ...unlimitedIncludedIds };
                    for (const d of filteredPresets) next[d.id] = true;
                    setUnlimitedIncludedIds(next);
                  } else {
                    const next = { ...selectedDishes };
                    for (const d of filteredPresets) {
                      if (!existingDishNames.has(d.name.toLowerCase())) {
                        next[d.id] = next[d.id] ?? d.defaultPriceRupees;
                      }
                    }
                    setSelectedDishes(next);
                  }
                }}
              >
                Select All
              </Button>
              {(selectedCount > 0 || unlimitedSelectedCount > 0) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (unlimitedMode) setUnlimitedIncludedIds({});
                    else setSelectedDishes({});
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="grid max-h-80 grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPresets.map((dish) => {
              const alreadyAdded = !unlimitedMode && existingDishNames.has(dish.name.toLowerCase());
              const isChecked = unlimitedMode
                ? Boolean(unlimitedIncludedIds[dish.id])
                : selectedDishes[dish.id] !== undefined;

              return (
                <label
                  key={dish.id}
                  className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-xs transition-colors ${
                    alreadyAdded
                      ? 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                      : isChecked
                        ? 'border-slate-900 bg-slate-50 cursor-pointer'
                        : 'border-slate-200 bg-white hover:border-slate-300 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      disabled={alreadyAdded}
                      checked={isChecked || alreadyAdded}
                      onChange={() => toggleDishSelection(dish.id, dish.defaultPriceRupees)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            dish.dietaryType === 'VEG' ? 'bg-emerald-600' : 'bg-red-600'
                          }`}
                        />
                        <span className="truncate font-medium text-slate-900">{dish.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {dish.categoryName} • {dish.dietaryType === 'VEG' ? 'Veg' : 'Non-Veg'}
                        {alreadyAdded ? ' • In Menu' : ''}
                      </div>
                    </div>
                  </div>
                  {!unlimitedMode && (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[11px] text-slate-500">₹</span>
                      <input
                        type="number"
                        min={1}
                        disabled={alreadyAdded}
                        value={selectedDishes[dish.id] ?? dish.defaultPriceRupees}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          setSelectedDishes((prev) => ({ ...prev, [dish.id]: val }));
                        }}
                        className="w-14 rounded border border-slate-200 bg-white px-1.5 py-1 text-right text-xs text-slate-900"
                      />
                    </div>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      </Card>

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
                      {p.description && (
                        <div className="mt-1 text-[11px] text-slate-500">{p.description}</div>
                      )}
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
