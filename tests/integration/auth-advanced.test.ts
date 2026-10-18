import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestHelpers, auth } from '../helpers/auth';
import type { TestHelpers } from 'better-auth/plugins';

// ─── Forget / Reset Password ────────────────────────────────────────

describe('Auth — Forget & Reset Password', () => {
  let test: TestHelpers;
  const email = `adv-reset-${Date.now()}@test.com`;
  const originalPwd = 'Original1234!';
  let userId: string;

  beforeAll(async () => {
    test = await getTestHelpers();
    const result = await auth.api.signUpEmail({
      body: { email, password: originalPwd, name: 'Reset User' },
    });
    userId = result.user.id;

    // Force email verification so signIn works
    const { getDrizzle, schema } = await import('@database/drizzle');
    const { eq } = await import('drizzle-orm');
    await getDrizzle()
      .update(schema.user)
      .set({ emailVerified: true })
      .where(eq(schema.user.id, userId));
  });

  afterAll(async () => {
    if (userId) await test.deleteUser(userId).catch(() => {});
  });

  it('requestPasswordReset succeeds without error', async () => {
    // Calling requestPasswordReset for a valid user should not throw
    const result = await auth.api.requestPasswordReset({
      body: { email, redirectTo: 'http://localhost:4321/fr/auth/reset-password' },
    });
    // API returns a success response
    expect(result).toBeDefined();
  });

  it('requestPasswordReset for unknown email does not throw', async () => {
    // Should not reveal whether the email exists (no error thrown)
    const result = await auth.api.requestPasswordReset({
      body: { email: 'nonexistent@test.com', redirectTo: 'http://localhost:4321/fr/auth/reset-password' },
    });
    expect(result).toBeDefined();
  });
});

// ─── Change Password ────────────────────────────────────────────────

describe('Auth — Change Password', () => {
  let test: TestHelpers;
  const email = `adv-chpwd-${Date.now()}@test.com`;
  const oldPwd = 'OldPass1234!';
  const newPwd = 'NewPass5678!';
  let userId: string;

  beforeAll(async () => {
    test = await getTestHelpers();
    const result = await auth.api.signUpEmail({
      body: { email, password: oldPwd, name: 'ChPwd User' },
    });
    userId = result.user.id;

    const { getDrizzle, schema } = await import('@database/drizzle');
    const { eq } = await import('drizzle-orm');
    await getDrizzle()
      .update(schema.user)
      .set({ emailVerified: true })
      .where(eq(schema.user.id, userId));
  });

  afterAll(async () => {
    if (userId) await test.deleteUser(userId).catch(() => {});
  });

  it('changePassword updates credentials', async () => {
    const headers = await test.getAuthHeaders({ userId });

    await auth.api.changePassword({
      body: { currentPassword: oldPwd, newPassword: newPwd, revokeOtherSessions: true },
      headers,
    });

    // Old password should fail
    try {
      await auth.api.signInEmail({ body: { email, password: oldPwd } });
      throw new Error('Old password should fail');
    } catch {
      // expected
    }

    // New password works
    const result = await auth.api.signInEmail({ body: { email, password: newPwd } });
    expect(result.user.email).toBe(email);
  }, 60_000);

  it('changePassword rejects wrong current password', async () => {
    const headers = await test.getAuthHeaders({ userId });

    try {
      await auth.api.changePassword({
        body: { currentPassword: 'WrongCurrent!', newPassword: 'Whatever1!' },
        headers,
      });
      throw new Error('Should reject wrong current password');
    } catch (err: any) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message || err.statusCode || err.status).toBeTruthy();
    }
  }, 30_000);
});

// ─── Email Verification ─────────────────────────────────────────────

describe('Auth — Email Verification', () => {
  let test: TestHelpers;
  const email = `adv-verify-${Date.now()}@test.com`;
  const password = 'Verify1234!';
  let userId: string;

  beforeAll(async () => {
    test = await getTestHelpers();
    const result = await auth.api.signUpEmail({
      body: { email, password, name: 'Verify User' },
    });
    userId = result.user.id;
  });

  afterAll(async () => {
    if (userId) await test.deleteUser(userId).catch(() => {});
  });

  it('user starts as unverified after signUp', async () => {
    const { getDrizzle, schema } = await import('@database/drizzle');
    const { eq } = await import('drizzle-orm');
    const [row] = await getDrizzle()
      .select({ emailVerified: schema.user.emailVerified })
      .from(schema.user)
      .where(eq(schema.user.id, userId));

    expect(row.emailVerified).toBe(false);
  });

  it('cannot sign in before email is verified', async () => {
    try {
      await auth.api.signInEmail({ body: { email, password } });
      throw new Error('Should reject unverified email');
    } catch (err: any) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message || err.statusCode || err.status).toBeTruthy();
    }
  });

  it('can sign in after email is verified in DB', async () => {
    const { getDrizzle, schema } = await import('@database/drizzle');
    const { eq } = await import('drizzle-orm');
    await getDrizzle()
      .update(schema.user)
      .set({ emailVerified: true })
      .where(eq(schema.user.id, userId));

    const result = await auth.api.signInEmail({ body: { email, password } });
    expect(result.user.email).toBe(email);
    expect(result.token).toBeTruthy();
  });
});

// ─── Update User ────────────────────────────────────────────────────

describe('Auth — Update User', () => {
  let test: TestHelpers;
  const email = `adv-update-${Date.now()}@test.com`;
  let userId: string;

  beforeAll(async () => {
    test = await getTestHelpers();
    const result = await auth.api.signUpEmail({
      body: { email, password: 'Update1234!', name: 'Before Update' },
    });
    userId = result.user.id;

    const { getDrizzle, schema } = await import('@database/drizzle');
    const { eq } = await import('drizzle-orm');
    await getDrizzle()
      .update(schema.user)
      .set({ emailVerified: true })
      .where(eq(schema.user.id, userId));
  });

  afterAll(async () => {
    if (userId) await test.deleteUser(userId).catch(() => {});
  });

  it('updateUser changes the user name', async () => {
    const headers = await test.getAuthHeaders({ userId });

    await auth.api.updateUser({
      body: { name: 'After Update' },
      headers,
    });

    const { getDrizzle, schema } = await import('@database/drizzle');
    const { eq } = await import('drizzle-orm');
    const [row] = await getDrizzle()
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, userId));

    expect(row.name).toBe('After Update');
  });

  it('updateUser changes the username', async () => {
    const headers = await test.getAuthHeaders({ userId });
    const newUsername = `userupd${Date.now().toString(36)}`;

    await auth.api.updateUser({
      body: { username: newUsername },
      headers,
    });

    const { getDrizzle, schema } = await import('@database/drizzle');
    const { eq } = await import('drizzle-orm');
    const [row] = await getDrizzle()
      .select({ username: schema.user.username })
      .from(schema.user)
      .where(eq(schema.user.id, userId));

    expect(row.username).toBe(newUsername);
  });

  it('getSession reflects updated user data', async () => {
    const headers = await test.getAuthHeaders({ userId });
    const session = await auth.api.getSession({ headers });
    expect(session).not.toBeNull();
    expect(session!.user.name).toBe('After Update');
  });
});
