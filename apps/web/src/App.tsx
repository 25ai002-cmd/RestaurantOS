import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiFetch } from './lib/api';
import { useAuthStore, type ActiveRestaurant, type AuthUser } from './stores/authStore';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPage } from './pages/AdminPage';
import { StorefrontPage } from './pages/StorefrontPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const ProtectedRoute: React.FC<{ children: React.ReactNode; requireSuperAdmin?: boolean }> = ({
  children,
  requireSuperAdmin = false,
}) => {
  const { user, isHydrated } = useAuthStore();

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-xs text-slate-500">
        Verifying session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireSuperAdmin && !user.isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const AuthHydrator: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setSession, clearSession, isHydrated } = useAuthStore();

  useEffect(() => {
    if (isHydrated) return;

    (async () => {
      try {
        const refresh = await apiFetch<{ accessToken: string }>(
          '/api/v1/auth/refresh',
          { method: 'POST' },
          false,
        );
        useAuthStore.getState().setAccessToken(refresh.accessToken);
        const me = await apiFetch<{
          user: AuthUser;
          activeRestaurant: ActiveRestaurant | null;
        }>('/api/v1/auth/me', {}, false);

        setSession({
          accessToken: refresh.accessToken,
          user: me.user,
          activeRestaurant: me.activeRestaurant,
        });
      } catch {
        clearSession();
      }
    })();
  }, [isHydrated, setSession, clearSession]);

  return <>{children}</>;
};

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthHydrator>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/r/:slug" element={<StorefrontPage />} />
            <Route path="/q/:qrToken" element={<StorefrontPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <AdminPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AuthHydrator>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
