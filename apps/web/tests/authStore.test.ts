import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../src/stores/authStore';

describe('AuthStore (In-Memory Session)', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('stores session in memory and clears cleanly', () => {
    useAuthStore.getState().setSession({
      accessToken: 'jwt-123',
      user: {
        id: 'u1',
        email: 'owner@test.com',
        fullName: 'Test Owner',
        isSuperAdmin: false,
      },
      activeRestaurant: {
        id: 'r1',
        name: 'Grand Kitchen',
        slug: 'grand-kitchen',
        status: 'ACTIVE',
        roleCode: 'OWNER',
        roleName: 'Restaurant Owner',
        permissions: ['restaurant:read'],
      },
    });

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('jwt-123');
    expect(state.activeRestaurant?.slug).toBe('grand-kitchen');

    state.clearSession();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
