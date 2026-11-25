import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

const app = createApp();

describe('Phase 1 Integration: Auth, RBAC & Multi-Tenant Isolation', () => {
  const uniqueSuffix = Date.now().toString(36);
  const emailA = `owner-a-${uniqueSuffix}@grandkitchen.test`;
  const slugA = `grand-kitchen-${uniqueSuffix}`;
  const emailB = `owner-b-${uniqueSuffix}@urbancafe.test`;
  const slugB = `urban-cafe-${uniqueSuffix}`;
  const waiterEmail = `waiter-a-${uniqueSuffix}@grandkitchen.test`;

  let tokenA = '';
  let restaurantAId = '';
  let restaurantBId = '';
  let waiterToken = '';
  let refreshCookieA = '';

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    // Clean up test records
    if (restaurantAId) {
      await prisma.restaurant.deleteMany({ where: { id: restaurantAId } });
    }
    if (restaurantBId) {
      await prisma.restaurant.deleteMany({ where: { id: restaurantBId } });
    }
    await prisma.user.deleteMany({
      where: { email: { in: [emailA, emailB, waiterEmail] } },
    });
    await prisma.$disconnect();
  });

  it('GET /api/v1/health returns ok and database connected', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.database).toBe('connected');
  });

  it('registers two independent restaurants (Tenant A and Tenant B)', async () => {
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Arjun Mehta',
        email: emailA,
        password: 'Password@123',
        restaurantName: 'The Grand Kitchen',
        restaurantSlug: slugA,
      });

    expect(resA.status).toBe(201);
    expect(resA.body.success).toBe(true);
    tokenA = resA.body.data.accessToken;
    restaurantAId = resA.body.data.restaurant.id;

    const cookies = resA.headers['set-cookie'];
    expect(cookies).toBeDefined();
    refreshCookieA = Array.isArray(cookies) ? cookies[0] : cookies;

    const resB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Priya Nair',
        email: emailB,
        password: 'Password@123',
        restaurantName: 'Urban Café',
        restaurantSlug: slugB,
      });

    expect(resB.status).toBe(201);
    restaurantBId = resB.body.data.restaurant.id;
    expect(restaurantAId).not.toBe(restaurantBId);
  });

  it('allows Tenant A to read and update its own profile', async () => {
    const getRes = await request(app)
      .get('/api/v1/restaurant/profile')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.restaurant.id).toBe(restaurantAId);

    const patchRes = await request(app)
      .patch('/api/v1/restaurant/profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ primaryColor: '#1D4ED8', welcomeTitle: 'Welcome to Grand Kitchen' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.restaurant.primaryColor).toBe('#1D4ED8');
  });

  it('blocks cross-tenant spoofing attempts via headers, query, or body', async () => {
    const headerSpoof = await request(app)
      .get('/api/v1/restaurant/profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Tenant-Id', restaurantBId);
    expect(headerSpoof.status).toBe(403);

    const querySpoof = await request(app)
      .get(`/api/v1/restaurant/profile?restaurantId=${restaurantBId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(querySpoof.status).toBe(403);

    const bodySpoof = await request(app)
      .patch('/api/v1/restaurant/profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ restaurantId: restaurantBId, name: 'Hacked' });
    expect(bodySpoof.status).toBe(403);
  });

  it('enforces RBAC permissions for staff roles', async () => {
    const createStaff = await request(app)
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        fullName: 'Rohan Waiter',
        email: waiterEmail,
        password: 'Password@123',
        roleCode: 'WAITER',
      });
    expect(createStaff.status).toBe(201);

    const loginWaiter = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: waiterEmail, password: 'Password@123' });
    expect(loginWaiter.status).toBe(200);
    waiterToken = loginWaiter.body.data.accessToken;

    // Waiter should NOT be able to edit restaurant profile or add staff
    const deniedProfile = await request(app)
      .patch('/api/v1/restaurant/profile')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ name: 'Unauthorized Rename' });
    expect(deniedProfile.status).toBe(403);

    const deniedStaff = await request(app)
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        fullName: 'Another',
        email: `x-${uniqueSuffix}@test.com`,
        password: 'Password@123',
        roleCode: 'WAITER',
      });
    expect(deniedStaff.status).toBe(403);
  });

  it('denies Super Admin endpoints to regular restaurant owners', async () => {
    const res = await request(app)
      .get('/api/v1/admin/restaurants')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
  });

  it('resolves public white-label branding by slug and rejects unknown domains', async () => {
    const okRes = await request(app).get(`/api/v1/public/tenant-context?slug=${slugA}`);
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.branding.slug).toBe(slugA);
    expect(okRes.body.data.branding.primaryColor).toBe('#1D4ED8');

    const unknownHost = await request(app)
      .get('/api/v1/public/tenant-context')
      .set('Host', 'unverified-evil-domain.com');
    expect(unknownHost.status).toBe(404);
  });

  it('rotates refresh token and revokes session on logout', async () => {
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookieA);
    expect(refreshRes.status).toBe(200);
    const newAccessToken = refreshRes.body.data.accessToken;
    expect(newAccessToken).toBeTruthy();

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${newAccessToken}`);
    expect(logoutRes.status).toBe(200);

    // Using the revoked session access token must fail
    const meAfterLogout = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${newAccessToken}`);
    expect(meAfterLogout.status).toBe(401);
  });
});
