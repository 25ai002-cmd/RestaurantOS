import { create } from 'zustand';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
}

export interface ActiveRestaurant {
  id: string;
  name: string;
  slug: string;
  status: string;
  primaryColor?: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  activeRestaurant: ActiveRestaurant | null;
  isHydrated: boolean;
  setSession: (payload: {
    accessToken: string;
    user: AuthUser;
    activeRestaurant: ActiveRestaurant | null;
  }) => void;
  setAccessToken: (token: string) => void;
  setHydrated: (hydrated: boolean) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  activeRestaurant: null,
  isHydrated: false,
  setSession: ({ accessToken, user, activeRestaurant }) =>
    set({ accessToken, user, activeRestaurant, isHydrated: true }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setHydrated: (isHydrated) => set({ isHydrated }),
  clearSession: () =>
    set({ accessToken: null, user: null, activeRestaurant: null, isHydrated: true }),
}));
