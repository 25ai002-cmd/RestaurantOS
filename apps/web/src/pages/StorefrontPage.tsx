import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Receipt, ShoppingBag, Star, UtensilsCrossed } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

interface PublicBranding {
  id: string;
  name: string;
  slug: string;
  status: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  welcomeTitle: string | null;
  welcomeMessage: string | null;
}

interface PublicCategory {
  id: string;
  name: string;
  products: {
    id: string;
    name: string;
    description: string | null;
    basePriceInr: number;
    dietaryType: string;
  }[];
}

interface CartData {
  items: {
    id: string;
    productName: string;
    quantity: number;
    lineTotalInr: number;
  }[];
  subtotalInr: number;
  taxInr: number;
  totalInr: number;
}

interface CustomerOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalInr: number;
  items: { id: string; productNameSnap: string; quantity: number }[];
}

interface CustomerBill {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotalInr: number;
  taxInr: number;
  discountInr: number;
  totalInr: number;
}

export const StorefrontPage: React.FC = () => {
  const { slug, qrToken } = useParams<{ slug?: string; qrToken?: string }>();

  const [customerToken, setCustomerToken] = useState<string | null>(null);
  const [tableSessionId, setTableSessionId] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [cart, setCart] = useState<CartData | null>(null);
  const [myOrders, setMyOrders] = useState<CustomerOrder[]>([]);
  const [myBills, setMyBills] = useState<CustomerBill[]>([]);
  const [dietFilter, setDietFilter] = useState<'ALL' | 'VEG' | 'NON_VEG'>('ALL');
  const [catFilter, setCatFilter] = useState<string>('ALL');
  const [rating, setRating] = useState(5);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const contextQuery = useQuery({
    queryKey: ['storefront-context', slug, qrToken],
    queryFn: async () => {
      if (qrToken) {
        const qrData = await apiFetch<{
          restaurant: PublicBranding;
          table: { tableNumber: string };
          branch: { name: string };
        }>(`/api/v1/public/qr/${encodeURIComponent(qrToken)}`);
        return { branding: qrData.restaurant, tableNumber: qrData.table.tableNumber };
      }
      const data = await apiFetch<{ branding: PublicBranding }>(
        slug ? `/api/v1/public/tenant-context?slug=${encodeURIComponent(slug)}` : '/api/v1/public/tenant-context',
      );
      return { branding: data.branding, tableNumber: null };
    },
  });

  const branding = contextQuery.data?.branding;

  const menuQuery = useQuery({
    queryKey: ['public-menu', branding?.slug],
    queryFn: () => apiFetch<{ categories: PublicCategory[] }>(`/api/v1/public/menu/${branding!.slug}`),
    enabled: Boolean(branding?.slug),
  });

  useEffect(() => {
    if (branding) {
      document.documentElement.style.setProperty('--brand-primary', branding.primaryColor);
      document.title = branding.name;
    }
  }, [branding]);

  const customerFetch = async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(customerToken ? { Authorization: `Bearer ${customerToken}` } : {}),
        ...(options.headers || {}),
      },
    });
    const json = await res.json();
    if (!res.ok) throw new ApiError(res.status, json?.error?.code || 'ERR', json?.error?.message || 'Failed');
    return json.data as T;
  };

  // Poll live orders & bills when customer is authenticated
  useEffect(() => {
    if (!customerToken) return;
    let active = true;
    const sync = async () => {
      try {
        const [ordRes, billRes] = await Promise.all([
          customerFetch<{ orders: CustomerOrder[] }>('/api/v1/orders/my'),
          customerFetch<{ bills: CustomerBill[] }>('/api/v1/bills/my'),
        ]);
        if (active) {
          setMyOrders(ordRes.orders);
          setMyBills(billRes.bills);
        }
      } catch {
        // Ignore transient poll errors
      }
    };
    sync();
    const timer = setInterval(sync, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [customerToken]);

  // Fetch randomized feedback suggestions when rating changes
  useEffect(() => {
    if (!customerToken) return;
    customerFetch<{ suggestions: string[] }>(`/api/v1/feedback/templates?rating=${rating}`)
      .then((res) => setSuggestions(res.suggestions))
      .catch(() => {});
  }, [customerToken, rating]);

  const handleRequestOtp = async () => {
    if (!branding) return;
    setStatusMsg(null);
    try {
      const data = await customerFetch<{ devOtpPreview?: string }>('/api/v1/customer/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ restaurantSlug: branding.slug, phone }),
      });
      setOtpSent(true);
      setDevOtp(data.devOtpPreview || null);
    } catch (err) {
      setStatusMsg(err instanceof ApiError ? err.message : 'OTP request failed');
    }
  };

  const handleVerifyOtp = async () => {
    if (!branding) return;
    setStatusMsg(null);
    try {
      const data = await customerFetch<{ accessToken: string }>('/api/v1/customer/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ restaurantSlug: branding.slug, phone, otp }),
      });
      setCustomerToken(data.accessToken);

      if (qrToken) {
        const res = await fetch(`${API_BASE}/api/v1/sessions/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.accessToken}`,
          },
          body: JSON.stringify({ qrToken }),
        });
        const joined = await res.json();
        if (res.ok) {
          const sid = joined.data.tableSession.id as string;
          setTableSessionId(sid);
          const cartRes = await fetch(`${API_BASE}/api/v1/cart?tableSessionId=${encodeURIComponent(sid)}`, {
            headers: { Authorization: `Bearer ${data.accessToken}` },
          });
          if (cartRes.ok) {
            const cartJson = await cartRes.json();
            setCart(cartJson.data.cart);
          }
        }
      }
      setStatusMsg('Mobile verified! Add items to your cart and place your order.');
    } catch (err) {
      setStatusMsg(err instanceof ApiError ? err.message : 'Verification failed');
    }
  };

  const handleAddToCart = async (productId: string) => {
    if (!customerToken || !tableSessionId) {
      setStatusMsg('Verify your mobile number first to add items to your table cart.');
      return;
    }
    try {
      const data = await customerFetch<{ cart: CartData }>('/api/v1/cart/items', {
        method: 'POST',
        body: JSON.stringify({ tableSessionId, productId, quantity: 1 }),
      });
      setCart(data.cart);
    } catch (err) {
      setStatusMsg(err instanceof ApiError ? err.message : 'Could not add item');
    }
  };

  const handleUpdateQty = async (itemId: string, quantity: number) => {
    try {
      const data = await customerFetch<{ cart: CartData }>(`/api/v1/cart/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity }),
      });
      setCart(data.cart);
    } catch (err) {
      setStatusMsg(err instanceof ApiError ? err.message : 'Could not update cart');
    }
  };

  const handlePlaceOrder = async () => {
    if (!tableSessionId) return;
    try {
      const data = await customerFetch<{ order: CustomerOrder }>('/api/v1/orders', {
        method: 'POST',
        body: JSON.stringify({ tableSessionId }),
      });
      setMyOrders((prev) => [data.order, ...prev]);
      setCart({ items: [], subtotalInr: 0, taxInr: 0, totalInr: 0 });
      setStatusMsg(`Order ${data.order.orderNumber} sent to kitchen!`);
    } catch (err) {
      setStatusMsg(err instanceof ApiError ? err.message : 'Order failed');
    }
  };

  const handleInitiatePayment = async (billId: string) => {
    try {
      const data = await customerFetch<{ payment: { razorpayOrderId: string; amountInr: number } }>(
        '/api/v1/payments/create-order',
        {
          method: 'POST',
          body: JSON.stringify({ billId, idempotencyKey: `pay_${billId}_${Date.now()}` }),
        },
      );
      setStatusMsg(
        `Payment order ${data.payment.razorpayOrderId} created (₹${(data.payment.amountInr / 100).toFixed(2)}). Complete via restaurant Razorpay checkout or pay at counter.`,
      );
    } catch (err) {
      setStatusMsg(err instanceof ApiError ? err.message : 'Could not initiate payment');
    }
  };

  const handleSubmitFeedback = async () => {
    const targetOrder = myOrders[0];
    if (!targetOrder) return;
    try {
      await customerFetch('/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify({ orderId: targetOrder.id, rating, comment }),
      });
      setFeedbackSent(true);
      setStatusMsg('Thank you for your feedback!');
    } catch (err) {
      setStatusMsg(err instanceof ApiError ? err.message : 'Feedback failed');
    }
  };

  if (contextQuery.isLoading) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading storefront...</div>;
  }

  if (!branding) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="p-6 text-center text-xs text-slate-600">Storefront not found or inactive.</Card>
      </div>
    );
  }

  const categories = menuQuery.data?.categories || [];
  const hasVeg = categories.some((c) => c.products.some((p) => p.dietaryType === 'VEG'));
  const hasNonVeg = categories.some((c) => c.products.some((p) => p.dietaryType === 'NON_VEG'));
  const showDietFilter = hasVeg && hasNonVeg;
  const effectiveDietFilter = showDietFilter ? dietFilter : 'ALL';

  const nonEmptyCategories = categories
    .map((c) => ({
      ...c,
      products: c.products.filter(
        (p) => effectiveDietFilter === 'ALL' || p.dietaryType === effectiveDietFilter,
      ),
    }))
    .filter((c) => c.products.length > 0);

  const filteredCategories = nonEmptyCategories.filter(
    (c) => catFilter === 'ALL' || c.id === catFilter,
  );

  const hasPaidBill = myBills.some((b) => b.status === 'PAID');

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: branding.backgroundColor }}>
      <header className="px-4 py-4 text-white" style={{ backgroundColor: branding.primaryColor }}>
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
              <UtensilsCrossed className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold">{branding.name}</h1>
              {contextQuery.data?.tableNumber && (
                <p className="text-xs opacity-90">Table {contextQuery.data.tableNumber}</p>
              )}
            </div>
          </div>
          <Badge tone={branding.status === 'ACTIVE' ? 'success' : 'warning'}>{branding.status}</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-5 px-4 py-6">
        {statusMsg && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-800 shadow-sm">
            {statusMsg}
          </div>
        )}

        {!customerToken && (
          <Card className="p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Verify Mobile to Order</h2>
            <div className="flex gap-2">
              <Input
                placeholder="+919876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="flex-1"
              />
              <Button size="sm" onClick={handleRequestOtp}>
                Send OTP
              </Button>
            </div>
            {otpSent && (
              <div className="space-y-2">
                {devOtp && <p className="text-[11px] text-amber-700">OTP: {devOtp}</p>}
                <div className="flex gap-2">
                  <Input
                    placeholder="6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleVerifyOtp}>
                    Verify
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Dietary & Category Filter Bar (only show filters that have items) */}
        {(showDietFilter || nonEmptyCategories.length > 1) && (
          <div className="space-y-2">
            {showDietFilter && (
              <div className="flex gap-1.5">
                {(['ALL', 'VEG', 'NON_VEG'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      setDietFilter(d);
                      setCatFilter('ALL');
                    }}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      dietFilter === d
                        ? d === 'VEG'
                          ? 'bg-emerald-600 text-white'
                          : d === 'NON_VEG'
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {d === 'ALL' ? 'All' : d === 'VEG' ? 'Veg' : 'Non-Veg'}
                  </button>
                ))}
              </div>
            )}
            {nonEmptyCategories.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                <button
                  onClick={() => setCatFilter('ALL')}
                  className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${
                    catFilter === 'ALL' ? 'bg-slate-900 text-white' : 'border bg-white text-slate-600'
                  }`}
                >
                  All Menu
                </button>
                {nonEmptyCategories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCatFilter(c.id)}
                    className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${
                      catFilter === c.id ? 'bg-slate-900 text-white' : 'border bg-white text-slate-600'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {filteredCategories.map((cat) => (
          <div key={cat.id} className="space-y-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{cat.name}</h2>
            <div className="space-y-2">
              {cat.products.map((p) => (
                <Card key={p.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          p.dietaryType === 'VEG' ? 'bg-emerald-600' : 'bg-red-600'
                        }`}
                      />
                      <span className="text-sm font-medium text-slate-900">{p.name}</span>
                    </div>
                    {p.description && <p className="mt-0.5 text-[11px] text-slate-500">{p.description}</p>}
                    <div className="mt-0.5 text-xs font-medium text-slate-700">
                      ₹{(p.basePriceInr / 100).toFixed(2)}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => handleAddToCart(p.id)}>
                    Add
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        ))}

        {cart && cart.items.length > 0 && (
          <Card className="p-5 space-y-3 border-2 border-slate-900">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShoppingBag className="h-4 w-4" /> Your Cart
              </span>
              <span className="text-sm font-bold text-slate-900">
                ₹{(cart.totalInr / 100).toFixed(2)}
              </span>
            </div>
            <div className="space-y-2 text-xs text-slate-700">
              {cart.items.map((i) => (
                <div key={i.id} className="flex items-center justify-between">
                  <span>{i.productName}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleUpdateQty(i.id, i.quantity - 1)}
                      className="h-6 w-6 rounded border text-center"
                    >
                      -
                    </button>
                    <span>{i.quantity}</span>
                    <button
                      onClick={() => handleUpdateQty(i.id, i.quantity + 1)}
                      className="h-6 w-6 rounded border text-center"
                    >
                      +
                    </button>
                    <span className="w-16 text-right">₹{(i.lineTotalInr / 100).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={handlePlaceOrder}>
              Place Order
            </Button>
          </Card>
        )}

        {myOrders.length > 0 && (
          <Card className="p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Your Orders (Live)</h2>
            <div className="divide-y divide-slate-100 space-y-2">
              {myOrders.map((o) => (
                <div key={o.id} className="pt-2 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-medium text-slate-900">{o.orderNumber}</div>
                    <div className="text-slate-500">
                      {o.items.map((i) => `${i.quantity}x ${i.productNameSnap}`).join(', ')}
                    </div>
                  </div>
                  <Badge tone={o.status === 'SERVED' ? 'success' : 'warning'}>{o.status}</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {myBills.length > 0 && (
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Receipt className="h-4 w-4" /> Your Bill
            </div>
            {myBills.map((b) => (
              <div key={b.id} className="space-y-2 border-t pt-3 text-xs">
                <div className="flex justify-between">
                  <span className="font-medium text-slate-900">{b.invoiceNumber}</span>
                  <Badge tone={b.status === 'PAID' ? 'success' : 'warning'}>{b.status}</Badge>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total Payable (incl. tax)</span>
                  <span className="font-semibold text-slate-900">₹{(b.totalInr / 100).toFixed(2)}</span>
                </div>
                {b.status === 'APPROVED' && (
                  <Button size="sm" className="w-full" onClick={() => handleInitiatePayment(b.id)}>
                    Pay Bill Now
                  </Button>
                )}
              </div>
            ))}
          </Card>
        )}

        {(hasPaidBill || myOrders.some((o) => o.status === 'SERVED')) && !feedbackSent && (
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Rate Your Experience
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className={`p-1 ${n <= rating ? 'text-amber-500' : 'text-slate-300'}`}
                >
                  <Star className="h-5 w-5 fill-current" />
                </button>
              ))}
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setComment(s)}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <Input
              placeholder="Write or edit your comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <Button size="sm" variant="secondary" onClick={handleSubmitFeedback}>
              Submit Feedback
            </Button>
          </Card>
        )}
      </main>
    </div>
  );
};
