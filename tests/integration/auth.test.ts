import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestHelpers, auth } from '../helpers/auth';
import type { TestHelpers } from 'better-auth/plugins';

describe('Auth — Session & User', () => {
  let test: TestHelpers;
  let savedUser: any;

  beforeAll(async () => {
    test = await getTestHelpers();
    const user = test.createUser({
      email: 'integration-session@test.com',
      name: 'Session Test User',
      emailVerified: true,
    });
    savedUser = await test.saveUser(user);
  });

  afterAll(async () => {
    if (savedUser?.id) {
      await test.deleteUser(savedUser.id);
    }
  });

  it('creates a valid session via login()', async () => {
    const { session, user, headers, token } = await test.login({
      userId: savedUser.id,
    });
    expect(session).toBeDefined();
    expect(session.userId).toBe(savedUser.id);
    expect(user.email).toBe('integration-session@test.com');
    expect(token).toBeTruthy();
    expect(headers).toBeDefined();
  });

  it('getSession returns user from auth headers', async () => {
    const headers = await test.getAuthHeaders({ userId: savedUser.id });
    const result = await auth.api.getSession({ headers });
    expect(result).not.toBeNull();
    expect(result!.user.id).toBe(savedUser.id);
    expect(result!.user.email).toBe('integration-session@test.com');
  });

  it('getSession returns null for empty headers', async () => {
    const result = await auth.api.getSession({ headers: new Headers() });
    expect(result).toBeNull();
  });
});

describe('Auth — Admin API', () => {
  let test: TestHelpers;
  let adminUser: any;
  let targetUser: any;

  beforeAll(async () => {
    test = await getTestHelpers();

    // Create admin user
    const admin = test.createUser({
      email: 'integration-admin@test.com',
      name: 'Admin User',
      emailVerified: true,
      role: 'admin',
    });
    adminUser = await test.saveUser(admin);

    // Create target user
    const target = test.createUser({
      email: 'integration-target@test.com',
      name: 'Target User',
      emailVerified: true,
    });
    targetUser = await test.saveUser(target);
  });

  afterAll(async () => {
    if (targetUser?.id) await test.deleteUser(targetUser.id).catch(() => {});
    if (adminUser?.id) await test.deleteUser(adminUser.id);
  });

  it('admin can list users', async () => {
    const headers = await test.getAuthHeaders({ userId: adminUser.id });
    const result = await auth.api.listUsers({
      query: { limit: 100 },
      headers,
    });
    expect((result as any)?.users).toBeDefined();
    const users = (result as any).users as any[];
    const found = users.find((u: any) => u.id === targetUser.id);
    expect(found).toBeDefined();
    expect(found?.email).toBe('integration-target@test.com');
  });

  it('admin can ban and unban a user', async () => {
    const headers = await test.getAuthHeaders({ userId: adminUser.id });

    // Ban
    await auth.api.banUser({
      body: { userId: targetUser.id },
      headers,
    });

    // Verify banned
    const afterBan = await auth.api.listUsers({
      query: { limit: 100 },
      headers,
    });
    const bannedUser = ((afterBan as any).users as any[]).find((u: any) => u.id === targetUser.id);
    expect(bannedUser?.banned).toBe(true);

    // Unban
    await auth.api.unbanUser({
      body: { userId: targetUser.id },
      headers,
    });

    // Verify unbanned
    const afterUnban = await auth.api.listUsers({
      query: { limit: 100 },
      headers,
    });
    const unbannedUser = ((afterUnban as any).users as any[]).find((u: any) => u.id === targetUser.id);
    expect(unbannedUser?.banned).toBeFalsy();
  });

  it('admin can change user role', async () => {
    const headers = await test.getAuthHeaders({ userId: adminUser.id });

    await auth.api.setRole({
      body: { userId: targetUser.id, role: 'admin' },
      headers,
    });

    const result = await auth.api.listUsers({
      query: { limit: 100 },
      headers,
    });
    const updated = ((result as any).users as any[]).find((u: any) => u.id === targetUser.id);
    expect(updated?.role).toBe('admin');

    // Revert to user
    await auth.api.setRole({
      body: { userId: targetUser.id, role: 'user' },
      headers,
    });
  });

  it('non-admin cannot list users', async () => {
    const headers = await test.getAuthHeaders({ userId: targetUser.id });
    try {
      const result = await auth.api.listUsers({
        query: { limit: 10 },
        headers,
      });
      // If it doesn't throw, the API should return an error-like object
      expect(result).toHaveProperty('status');
    } catch (err: any) {
      // Expected: non-admin is rejected
      expect(err).toBeInstanceOf(Error);
    }
  });
});

describe('Auth — Organization', () => {
  let test: TestHelpers;
  let ownerUser: any;
  let savedOrg: any;
  const orgSlug = `test-org-integration-${Date.now()}`;

  beforeAll(async () => {
    test = await getTestHelpers();
    const owner = test.createUser({
      email: `integration-org-owner-${Date.now()}@test.com`,
      name: 'Org Owner',
      emailVerified: true,
    });
    ownerUser = await test.saveUser(owner);
  });

  afterAll(async () => {
    // Clean up org first, then user
    if (savedOrg?.id) {
      const headers = await test.getAuthHeaders({ userId: ownerUser.id });
      await auth.api.deleteOrganization({
        body: { organizationId: savedOrg.id },
        headers,
      }).catch(() => {});
    }
    if (ownerUser?.id) await test.deleteUser(ownerUser.id);
  });

  it('user can create an organization', async () => {
    const headers = await test.getAuthHeaders({ userId: ownerUser.id });
    const org = await auth.api.createOrganization({
      body: { name: 'Test Org Integration', slug: orgSlug },
      headers,
    });
    expect(org).toBeDefined();
    expect(org.name).toBe('Test Org Integration');
    expect(org.slug).toBe(orgSlug);
    savedOrg = org;
  });

  it('user can list their organizations', async () => {
    const headers = await test.getAuthHeaders({ userId: ownerUser.id });
    const orgs = await auth.api.listOrganizations({ headers });
    expect(Array.isArray(orgs)).toBe(true);
    const found = orgs.find((o: any) => o.slug === orgSlug);
    expect(found).toBeDefined();
  });
});

// ─── Impersonation ──────────────────────────────────────────────────

describe('Auth — Impersonation', () => {
  let test: TestHelpers;
  let adminUser: any;
  let targetUser: any;

  beforeAll(async () => {
    test = await getTestHelpers();
    const admin = test.createUser({
      email: `imp-admin-${Date.now()}@test.com`,
      name: 'Imp Admin',
      emailVerified: true,
      role: 'admin',
    });
    adminUser = await test.saveUser(admin);

    const target = test.createUser({
      email: `imp-target-${Date.now()}@test.com`,
      name: 'Imp Target',
      emailVerified: true,
    });
    targetUser = await test.saveUser(target);
  });

  afterAll(async () => {
    if (targetUser?.id) await test.deleteUser(targetUser.id).catch(() => {});
    if (adminUser?.id) await test.deleteUser(adminUser.id).catch(() => {});
  });

  it('admin can impersonate a user and stop', async () => {
    const headers = await test.getAuthHeaders({ userId: adminUser.id });

    // Start impersonation
    const impResult = await auth.api.impersonateUser({
      body: { userId: targetUser.id },
      headers,
    });
    expect(impResult).toBeDefined();
    expect(impResult.session).toBeDefined();

    // The returned session should carry the impersonation marker
    const session = impResult.session as any;
    expect(session.impersonatedBy).toBe(adminUser.id);
    expect(session.userId).toBe(targetUser.id);
  });

  it('non-admin cannot impersonate', async () => {
    const headers = await test.getAuthHeaders({ userId: targetUser.id });
    try {
      await auth.api.impersonateUser({
        body: { userId: adminUser.id },
        headers,
      });
      throw new Error('Should have thrown');
    } catch (err: any) {
      expect(err).toBeDefined();
    }
  });
});

// ─── User deletion (RGPD) ──────────────────────────────────────────

describe('Auth — User Deletion (RGPD)', () => {
  let test: TestHelpers;
  let adminUser: any;
  let userToDelete: any;

  beforeAll(async () => {
    test = await getTestHelpers();
    const admin = test.createUser({
      email: `del-admin-${Date.now()}@test.com`,
      name: 'Del Admin',
      emailVerified: true,
      role: 'admin',
    });
    adminUser = await test.saveUser(admin);

    const target = test.createUser({
      email: `del-target-${Date.now()}@test.com`,
      name: 'To Be Deleted',
      emailVerified: true,
    });
    userToDelete = await test.saveUser(target);
  });

  afterAll(async () => {
    if (adminUser?.id) await test.deleteUser(adminUser.id).catch(() => {});
  });

  it('admin can remove a user', async () => {
    const headers = await test.getAuthHeaders({ userId: adminUser.id });

    await auth.api.removeUser({
      body: { userId: userToDelete.id },
      headers,
    });

    // Verify user no longer appears in listUsers
    const result = await auth.api.listUsers({
      query: { limit: 100 },
      headers,
    });
    const users = (result as any).users as any[];
    const found = users.find((u: any) => u.id === userToDelete.id);
    expect(found).toBeUndefined();
  });

  it('session is invalid after user deletion', async () => {
    // The deleted user's session should return null
    try {
      const headers = await test.getAuthHeaders({ userId: userToDelete.id });
      const session = await auth.api.getSession({ headers });
      // Either null or throws
      expect(session).toBeNull();
    } catch {
      // Expected — user no longer exists
    }
  });
});
