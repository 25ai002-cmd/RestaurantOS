import { useAuthStore } from '../stores/authStore';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return null;
  const json = await res.json();
  const token = json?.data?.accessToken as string | undefined;
  if (token) {
    useAuthStore.getState().setAccessToken(token);
    return token;
  }
  return null;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retryOnAuth = true,
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && retryOnAuth && !path.includes('/auth/login') && !path.includes('/auth/refresh')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return apiFetch<T>(path, options, false);
    }
    useAuthStore.getState().clearSession();
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      res.status,
      json?.error?.code || 'REQUEST_FAILED',
      json?.error?.message || `Request failed with status ${res.status}`,
    );
  }

  return json.data as T;
}
