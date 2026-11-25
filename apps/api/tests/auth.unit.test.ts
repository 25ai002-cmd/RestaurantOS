import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, signAccessToken, verifyAccessToken, slugify } from '../src/utils/crypto.js';

describe('Crypto & Token Utilities', () => {
  it('hashes and verifies passwords with bcrypt', async () => {
    const hash = await hashPassword('StrongPass@2026');
    expect(hash).not.toBe('StrongPass@2026');
    expect(await verifyPassword('StrongPass@2026', hash)).toBe(true);
    expect(await verifyPassword('WrongPass', hash)).toBe(false);
  });

  it('signs and verifies access tokens with tenant claims', () => {
    const token = signAccessToken({
      sub: '00000000-0000-0000-0000-000000000001',
      sid: '00000000-0000-0000-0000-000000000002',
      restaurantId: '00000000-0000-0000-0000-000000000003',
      roleCode: 'OWNER',
      isSuperAdmin: false,
    });

    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe('00000000-0000-0000-0000-000000000001');
    expect(decoded.restaurantId).toBe('00000000-0000-0000-0000-000000000003');
    expect(decoded.roleCode).toBe('OWNER');
    expect(decoded.type).toBe('access');
  });

  it('slugifies restaurant names safely', () => {
    expect(slugify('The Grand Kitchen!')).toBe('the-grand-kitchen');
    expect(slugify('  Urban   Café 24/7  ')).toBe('urban-caf-24-7');
  });
});
