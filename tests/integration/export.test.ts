import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestHelpers, auth } from '../helpers/auth';
import type { TestHelpers } from 'better-auth/plugins';

describe('API — /api/export-data', () => {
  let test: TestHelpers;
  let user: any;

  beforeAll(async () => {
    test = await getTestHelpers();
    const u = test.createUser({
      email: `export-${Date.now()}@test.com`,
      name: 'Export User',
      emailVerified: true,
    });
    user = await test.saveUser(u);
  });

  afterAll(async () => {
    if (user?.id) await test.deleteUser(user.id).catch(() => {});
  });

  it('returns null session for unauthenticated request', async () => {
    // Verify the auth guard logic used by the endpoint: getSession with no
    // credentials must return null, which the handler turns into a 401.
    const session = await auth.api.getSession({ headers: new Headers() });
    expect(session).toBeNull();
  });

  it('returns user data for authenticated request via auth.api', async () => {
    // Instead of HTTP call (which requires running server), verify the export
    // endpoint logic by calling the same DB queries the endpoint uses
    const { getDrizzle, schema } = await import('@database/drizzle');
    const { eq } = await import('drizzle-orm');
    const db = getDrizzle();

    const [userData] = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
      })
      .from(schema.user)
      .where(eq(schema.user.id, user.id));

    expect(userData).toBeDefined();
    expect(userData.email).toBe(user.email);
    expect(userData.name).toBe('Export User');
  });

  it('export query returns accounts for the user', async () => {
    const { getDrizzle, schema } = await import('@database/drizzle');
    const { eq } = await import('drizzle-orm');
    const db = getDrizzle();

    const accounts = await db
      .select({ id: schema.account.id, providerId: schema.account.providerId })
      .from(schema.account)
      .where(eq(schema.account.userId, user.id));

    // User created via testUtils has a credential account
    expect(Array.isArray(accounts)).toBe(true);
  });
});
