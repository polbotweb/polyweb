import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, desc } from 'drizzle-orm';
import { getTestHelpers, auth } from '../helpers/auth';
import { logAuditEvent } from '@/lib/audit';
import { getDrizzle } from '@database/drizzle';
import { auditLog } from '@database/schemas';
import type { TestHelpers } from 'better-auth/plugins';

// ─── Direct logAuditEvent() ─────────────────────────────────────────

describe('Audit — logAuditEvent()', () => {
  let insertedIds: string[] = [];

  afterAll(async () => {
    const db = getDrizzle();
    for (const id of insertedIds) {
      await db.delete(auditLog).where(eq(auditLog.id, id)).catch(() => {});
    }
  });

  it('inserts an audit event into the database', async () => {
    const db = getDrizzle();
    const before = Date.now();

    await logAuditEvent({
      action: 'FILE_UPLOAD',
      resource: 'file',
      resourceId: '/uploads/test.jpg',
      userId: null,
      metadata: { originalName: 'test.jpg', size: 12345 },
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'FILE_UPLOAD'))
      .orderBy(desc(auditLog.createdAt))
      .limit(1);

    expect(rows.length).toBe(1);
    const row = rows[0];
    insertedIds.push(row.id);

    expect(row.action).toBe('FILE_UPLOAD');
    expect(row.resource).toBe('file');
    expect(row.resourceId).toBe('/uploads/test.jpg');
    expect(row.ipAddress).toBe('127.0.0.1');
    expect(row.userAgent).toBe('vitest');
    expect(new Date(row.createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000);

    // metadata stored as jsonb — returned as object
    const meta = row.metadata as Record<string, unknown>;
    expect(meta.originalName).toBe('test.jpg');
    expect(meta.size).toBe(12345);
  });

  it('handles null metadata gracefully', async () => {
    const db = getDrizzle();

    await logAuditEvent({
      action: 'SIGN_OUT',
      resource: 'session',
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'SIGN_OUT'))
      .orderBy(desc(auditLog.createdAt))
      .limit(1);

    expect(rows.length).toBe(1);
    insertedIds.push(rows[0].id);
    expect(rows[0].metadata).toBeNull();
    expect(rows[0].userId).toBeNull();
  });
});

// ─── Audit hooks (verify auth actions produce audit entries) ────────

describe('Audit — Hooks integration', () => {
  let test: TestHelpers;
  let adminUser: any;
  let targetUser: any;
  let insertedIds: string[] = [];

  beforeAll(async () => {
    test = await getTestHelpers();
    const admin = test.createUser({
      email: `audit-admin-${Date.now()}@test.com`,
      name: 'Audit Admin',
      emailVerified: true,
      role: 'admin',
    });
    adminUser = await test.saveUser(admin);

    const target = test.createUser({
      email: `audit-target-${Date.now()}@test.com`,
      name: 'Audit Target',
      emailVerified: true,
    });
    targetUser = await test.saveUser(target);
  });

  afterAll(async () => {
    const db = getDrizzle();
    // Clean audit entries
    for (const id of insertedIds) {
      await db.delete(auditLog).where(eq(auditLog.id, id)).catch(() => {});
    }
    // Clean users
    if (targetUser?.id) await test.deleteUser(targetUser.id).catch(() => {});
    if (adminUser?.id) await test.deleteUser(adminUser.id).catch(() => {});
  });

  /** Helper: fetch the latest audit entry for a given action */
  async function getLatestAudit(action: string, waitMs = 500) {
    // Hooks use runInBackground — small delay needed
    await new Promise((r) => setTimeout(r, waitMs));
    const db = getDrizzle();
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, action))
      .orderBy(desc(auditLog.createdAt))
      .limit(1);
    if (rows.length > 0) insertedIds.push(rows[0].id);
    return rows[0] ?? null;
  }

  it('logs SIGN_UP when a user signs up', async () => {
    const email = `audit-signup-${Date.now()}@test.com`;
    const result = await auth.api.signUpEmail({
      body: { email, password: 'AuditTest123!', name: 'Audit Signup' },
    });

    const entry = await getLatestAudit('SIGN_UP');
    expect(entry).not.toBeNull();
    expect(entry!.resource).toBe('user');

    // Cleanup
    if (result?.user?.id) await test.deleteUser(result.user.id).catch(() => {});
  });

  it('logs USER_BAN when admin bans a user', async () => {
    const headers = await test.getAuthHeaders({ userId: adminUser.id });
    await auth.api.banUser({ body: { userId: targetUser.id }, headers });

    const entry = await getLatestAudit('USER_BAN');
    expect(entry).not.toBeNull();
    expect(entry!.resource).toBe('user');
    expect(entry!.resourceId).toBe(targetUser.id);

    // Unban to clean up
    await auth.api.unbanUser({ body: { userId: targetUser.id }, headers });
  });

  it('logs USER_ROLE_CHANGE when admin changes role', async () => {
    const headers = await test.getAuthHeaders({ userId: adminUser.id });
    await auth.api.setRole({
      body: { userId: targetUser.id, role: 'admin' },
      headers,
    });

    const entry = await getLatestAudit('USER_ROLE_CHANGE');
    expect(entry).not.toBeNull();
    expect(entry!.resource).toBe('user');

    // Revert
    await auth.api.setRole({
      body: { userId: targetUser.id, role: 'user' },
      headers,
    });
  });

  it('does not log passwords in metadata', async () => {
    const email = `audit-nopass-${Date.now()}@test.com`;
    const result = await auth.api.signUpEmail({
      body: { email, password: 'SecretP@ss1', name: 'NoPass Check' },
    });

    const entry = await getLatestAudit('SIGN_UP');
    expect(entry).not.toBeNull();

    if (entry!.metadata) {
      const meta = entry!.metadata as Record<string, unknown>;
      expect(meta.password).toBeUndefined();
      expect(meta.currentPassword).toBeUndefined();
      expect(meta.newPassword).toBeUndefined();
    }

    if (result?.user?.id) await test.deleteUser(result.user.id).catch(() => {});
  });

  it('logs SIGN_IN_FAILED for bad credentials', async () => {
    try {
      await auth.api.signInEmail({
        body: { email: 'nonexistent-audit@test.com', password: 'WrongPass1!' },
      });
    } catch {
      // expected
    }

    const entry = await getLatestAudit('SIGN_IN_FAILED');
    expect(entry).not.toBeNull();
    expect(entry!.resource).toBe('session');
    expect(entry!.userId).toBeNull();
  });

  it('filters metadata to SAFE_FIELDS only (no password in metadata)', async () => {
    const email = `audit-safe-${Date.now()}@test.com`;
    const result = await auth.api.signUpEmail({
      body: { email, password: 'SafeCheck1!', name: 'Safe User' },
    });

    const entry = await getLatestAudit('SIGN_UP');
    expect(entry).not.toBeNull();

    if (entry!.metadata) {
      const meta = entry!.metadata as Record<string, unknown>;
      // password must NEVER appear in metadata
      expect(meta).not.toHaveProperty('password');
      expect(meta).not.toHaveProperty('currentPassword');
      expect(meta).not.toHaveProperty('newPassword');
    }

    if (result?.user?.id) await test.deleteUser(result.user.id).catch(() => {});
  });
});
