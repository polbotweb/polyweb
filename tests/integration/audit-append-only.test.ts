import { describe, it, expect, afterAll } from 'vitest';
import { Effect } from 'effect';
import { eq, inArray, sql } from 'drizzle-orm';
import { getDrizzle } from '@/database/drizzle';
import { auditLog, user } from '@/database/schemas';
import { logAuditEventEffect } from '@/lib/audit';
import { purgeAuditLog } from '@/core/audit/retention';
import { purgeAuditRows } from '../helpers/audit-purge';

const db = getDrizzle();
const tag = `aao-${Date.now()}`;
const ids: string[] = [];

const insertRow = async (createdAt?: Date, userId?: string) => {
  const [row] = await db.insert(auditLog).values({ action: 'audit.test.row', module: 'audit', resource: tag, userId: userId ?? null, ...(createdAt ? { createdAt } : {}) }).returning({ id: auditLog.id });
  ids.push(row!.id);
  return row!.id;
};

afterAll(async () => {
  await purgeAuditRows(inArray(auditLog.id, ids));
  await db.delete(user).where(eq(user.email, `${tag}@example.test`));
});

describe('audit_log — ajout seul (déclencheur)', () => {
  it('UPDATE, DELETE et TRUNCATE sont refusés par la base', async () => {
    const id = await insertRow();
    await expect(db.update(auditLog).set({ action: 'audit.test.tampered' }).where(eq(auditLog.id, id))).rejects.toThrow();
    await expect(db.delete(auditLog).where(eq(auditLog.id, id))).rejects.toThrow();
    await expect(db.execute(sql`truncate audit_log`)).rejects.toThrow();
    const [row] = await db.select().from(auditLog).where(eq(auditLog.id, id));
    expect(row?.action).toBe('audit.test.row');
  });

  it('la suppression d’un compte anonymise ses entrées (user_id → NULL) sans les effacer', async () => {
    const [u] = await db.insert(user).values({ id: crypto.randomUUID(), name: 'Audit', email: `${tag}@example.test`, emailVerified: true }).returning({ id: user.id });
    const id = await insertRow(undefined, u!.id);
    await db.delete(user).where(eq(user.id, u!.id));
    const [row] = await db.select().from(auditLog).where(eq(auditLog.id, id));
    expect(row).toBeDefined();
    expect(row!.userId).toBeNull();
  });

  it('nouvelles colonnes de portée et résultat par défaut « success »', async () => {
    await Effect.runPromise(logAuditEventEffect({ action: 'crm.permission.denied', module: 'crm', organizationId: 'org-x', siteId: 'site-x', outcome: 'denied', resource: tag }));
    const rows = await db.select().from(auditLog).where(eq(auditLog.resource, tag));
    ids.push(...rows.map((r) => r.id));
    const denied = rows.find((r) => r.action === 'crm.permission.denied');
    expect(denied).toMatchObject({ module: 'crm', organizationId: 'org-x', siteId: 'site-x', outcome: 'denied' });
    expect(rows.find((r) => r.action === 'audit.test.row')?.outcome).toBe('success');
  });

  it('la purge de rétention supprime seulement les entrées échues et s’audite elle-même', async () => {
    const old = await insertRow(new Date(Date.now() - 400 * 86_400_000));
    const recent = await insertRow(new Date(Date.now() - 10 * 86_400_000));
    const result = await Effect.runPromise(purgeAuditLog(365));
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    const left = (await db.select({ id: auditLog.id }).from(auditLog).where(inArray(auditLog.id, [old, recent]))).map((r) => r.id);
    expect(left).toEqual([recent]);
    const [purge] = await db.select().from(auditLog).where(eq(auditLog.action, 'audit.log.purge')).orderBy(sql`created_at desc`).limit(1);
    expect(purge?.metadata).toMatchObject({ days: 365 });
    if (purge) ids.push(purge.id);
  });
});
