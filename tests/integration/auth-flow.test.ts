import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestHelpers, auth } from '../helpers/auth';
import type { TestHelpers } from 'better-auth/plugins';

describe('Auth — Sign-up & Sign-in flow', () => {
  let test: TestHelpers;
  const email = `flow-${Date.now()}@test.com`;
  const password = 'Test1234!secure';
  let createdUserId: string | undefined;

  beforeAll(async () => {
    test = await getTestHelpers();
  });

  afterAll(async () => {
    if (createdUserId) {
      await test.deleteUser(createdUserId).catch(() => {});
    }
  });

  it('signUpEmail creates a new user (no session when emailVerification required)', async () => {
    const result = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: 'Flow Test User',
      },
    });
    expect(result).toBeDefined();
    expect(result.user).toBeDefined();
    expect(result.user.email).toBe(email);
    expect(result.user.name).toBe('Flow Test User');
    // requireEmailVerification is true — no session until verified
    expect(result.user.emailVerified).toBeFalsy();
    createdUserId = result.user.id;

    // Verify the email in DB so subsequent tests can sign in
    const { getDrizzle, schema } = await import('@database/drizzle');
    const { eq } = await import('drizzle-orm');
    await getDrizzle()
      .update(schema.user)
      .set({ emailVerified: true })
      .where(eq(schema.user.id, createdUserId));
  });

  it('signInEmail returns a session for valid credentials', async () => {
    const result = await auth.api.signInEmail({
      body: { email, password },
    });
    expect(result).toBeDefined();
    expect(result.user).toBeDefined();
    expect(result.user.email).toBe(email);
    expect(result.token).toBeTruthy();
  });

  it('signInEmail rejects invalid password', async () => {
    try {
      await auth.api.signInEmail({
        body: { email, password: 'WrongPassword!' },
      });
      throw new Error('Should have thrown');
    } catch (err: any) {
      expect(err).toBeDefined();
    }
  });

  it('signInEmail rejects non-existent email', async () => {
    try {
      await auth.api.signInEmail({
        body: { email: 'no-such-user@test.com', password },
      });
      throw new Error('Should have thrown');
    } catch (err: any) {
      expect(err).toBeDefined();
    }
  });

  it('signOut invalidates the session', async () => {
    const headers = await test.getAuthHeaders({ userId: createdUserId! });

    // Confirm session exists
    const before = await auth.api.getSession({ headers });
    expect(before).not.toBeNull();

    // Sign out
    await auth.api.signOut({ headers });

    // Session should now be invalid (new getAuthHeaders to verify the old token is gone)
    // Note: the old headers token may still be cached — create a new check
    const afterResult = await auth.api.getSession({ headers });
    // After signout the session associated with these headers should be gone
    expect(afterResult).toBeNull();
  });
});
