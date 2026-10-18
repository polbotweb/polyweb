import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestHelpers, auth } from '../helpers/auth';
import type { TestHelpers } from 'better-auth/plugins';

/**
 * Tests the middleware logic: auth.api.getSession(headers) → locals.
 * We can't import the actual Astro middleware (depends on astro:middleware),
 * so we test the core behavior: getSession with various headers returns
 * the correct user/session or null.
 */
describe('Middleware logic — getSession with headers', () => {
  let test: TestHelpers;
  let user: any;

  beforeAll(async () => {
    test = await getTestHelpers();
    const u = test.createUser({
      email: `mw-test-${Date.now()}@test.com`,
      name: 'Middleware User',
      emailVerified: true,
    });
    user = await test.saveUser(u);
  });

  afterAll(async () => {
    if (user?.id) await test.deleteUser(user.id).catch(() => {});
  });

  it('returns user and session for authenticated headers', async () => {
    const headers = await test.getAuthHeaders({ userId: user.id });
    const result = await auth.api.getSession({ headers });

    expect(result).not.toBeNull();
    expect(result!.user.id).toBe(user.id);
    expect(result!.user.email).toBe(user.email);
    expect(result!.session).toBeDefined();
    expect(result!.session.userId).toBe(user.id);
  });

  it('returns null for empty headers (unauthenticated)', async () => {
    const result = await auth.api.getSession({ headers: new Headers() });
    expect(result).toBeNull();
  });

  it('returns null for invalid auth token', async () => {
    const headers = new Headers({
      authorization: 'Bearer invalid-token-value',
    });
    const result = await auth.api.getSession({ headers });
    expect(result).toBeNull();
  });

  it('returns null for expired/revoked session', async () => {
    const headers = await test.getAuthHeaders({ userId: user.id });

    // Sign out to invalidate
    await auth.api.signOut({ headers });

    // Session should now be null
    const result = await auth.api.getSession({ headers });
    expect(result).toBeNull();
  });
});
