import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShoppingBag, Star, UtensilsCrossed } from 'lucide-react';
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
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [lastOrderStatus, setLastOrderStatus] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
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
          setTableSessionId(joined.data.tableSession.id);
        }
      }
      setStatusMsg('Verified! You can now add items and order.');
    } catch (err) {
      setStatusMsg(err instanceof ApiError ? err.message : 'Verification failed');
    }
  };

  const handleAddToCart = async (productId: string) => {
    if (!customerToken || !tableSessionId) {
      setStatusMsg('Verify your mobile number at a table QR first to add items to cart.');
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

  const handlePlaceOrder = async () => {
    if (!tableSessionId) return;
    try {
      const data = await customerFetch<{ order: { id: string; orderNumber: string; status: string } }>(
        '/api/v1/orders',
        {
          method: 'POST',
          body: JSON.stringify({ tableSessionId }),
        },
      );
      setLastOrderId(data.order.id);
      setLastOrderStatus(data.order.status);
      setCart({ items: [], totalInr: 0 });
      setStatusMsg(`Order ${data.order.orderNumber} placed!`);
    } catch (err) {
      setStatusMsg(err instanceof ApiError ? err.message : 'Order failed');
    }
  };

  const handleSubmitFeedback = async () => {
    if (!lastOrderId) return;
    try {
      await customerFetch('/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify({ orderId: lastOrderId, rating, comment }),
      });
      setStatusMsg('Thank you for your feedback!');
      setComment('');
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
                {devOtp && <p className="text-[11px] text-amber-700">Dev OTP Preview: {devOtp}</p>}
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

        {menuQuery.data?.categories.map((cat) => (
          <div key={cat.id} className="space-y-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{cat.name}</h2>
            <div className="space-y-2">
              {cat.products.map((p) => (
                <Card key={p.id} className="flex items-center justify-between p-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      ₹{(p.basePriceInr / 100).toFixed(2)} • {p.dietaryType}
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
          <Card className="p-5 space-y-3 border-slate-900">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShoppingBag className="h-4 w-4" /> Your Cart
              </span>
              <span className="text-sm font-bold text-slate-900">
                ₹{(cart.totalInr / 100).toFixed(2)}
              </span>
            </div>
            <div className="space-y-1 text-xs text-slate-600">
              {cart.items.map((i) => (
                <div key={i.id} className="flex justify-between">
                  <span>
                    {i.quantity}x {i.productName}
                  </span>
                  <span>₹{(i.lineTotalInr / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={handlePlaceOrder}>
              Place Order
            </Button>
          </Card>
        )}

        {lastOrderId && (
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Order Status: {lastOrderStatus}
            </div>
            <div className="border-t pt-3 space-y-2">
              <div className="text-xs font-medium text-slate-700">Rate your experience</div>
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
              <Input
                placeholder="Share your feedback (optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <Button size="sm" variant="secondary" onClick={handleSubmitFeedback}>
                Submit Feedback
              </Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
};
