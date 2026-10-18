/**
 * Actions groupées des pages sur le moteur générique core/bulk — base réelle.
 * Publication (instantané de version par page, audit batchId commun) ; corbeille/restauration ;
 * suppression définitive limitée à la corbeille ; tout ou rien sur état incompatible.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: any) => def };
});

import { and, eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { auditLog, pageVersions, pages, user } from '@database/schemas';
import { bulkArchivePages, bulkDeletePages, bulkPublishPages, bulkRestorePages } from '@/actions/admin/pages';
import { resetRateLimiter } from '@/lib/rate-limit';

const h = (a: unknown) => (a as any).handler as (i: any, c: any) => Promise<any>;
const db = getDrizzle();
const t = `pbulk-${Date.now().toString(36)}`;
const admin = `${t}-admin`;
const ids = [crypto.randomUUID(), crypto.randomUUID()];
const ctx = () => ({ locals: { user: { id: admin, role: 'admin', email: `${admin}@test.local`, banned: false }, session: { id: `${t}-s` } }, request: { headers: new Headers() }, clientAddress: '127.0.0.1' }) as any;
const state = async () => db.select({ id: pages.id, isPublished: pages.isPublished, deletedAt: pages.deletedAt }).from(pages).where(inArray(pages.id, ids));

beforeAll(async () => {
  await db.insert(user).values({ id: admin, name: 'Pages bulk admin', email: `${admin}@test.local`, role: 'admin' });
  await db.insert(pages).values(ids.map((id, i) => ({ id, locale: 'fr' as const, title: `Bulk ${i}`, slug: `${t}-${i}` })));
});

afterAll(async () => {
  await db.delete(pages).where(inArray(pages.id, ids));
  await db.delete(user).where(eq(user.id, admin));
});

describe('pages bulk (core/bulk)', () => {
  it('publie tout, un instantané de version par page, audit batchId commun', async () => {
    resetRateLimiter();
    expect(await h(bulkPublishPages)({ ids, isPublished: true }, ctx())).toMatchObject({ success: true, count: 2 });
    expect((await state()).every((r) => r.isPublished)).toBe(true);
    expect((await db.select().from(pageVersions).where(inArray(pageVersions.pageId, ids))).length).toBe(2);
    let audits: Array<{ metadata: unknown }> = [];
    for (let i = 0; i < 50 && audits.length < 2; i++) {
      audits = await db.select({ metadata: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.action, 'PAGES_BULK_PUBLISH'), inArray(auditLog.resourceId, ids)));
      if (audits.length < 2) await new Promise((r) => setTimeout(r, 50));
    }
    expect(new Set(audits.map((a) => (a.metadata as any).batchId)).size).toBe(1);
  });

  it('suppression définitive hors corbeille → BAD_REQUEST, aucune écriture', async () => {
    await expect(h(bulkDeletePages)({ ids }, ctx())).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await state()).length).toBe(2);
  });

  it('corbeille puis restauration', async () => {
    expect(await h(bulkArchivePages)({ ids }, ctx())).toMatchObject({ count: 2 });
    expect((await state()).every((r) => r.deletedAt && !r.isPublished)).toBe(true);
    expect(await h(bulkRestorePages)({ ids: [ids[0]] }, ctx())).toMatchObject({ count: 1 });
    const rows = await state();
    expect(rows.find((r) => r.id === ids[0])!.deletedAt).toBeNull();
  });

  it('état mixte → tout ou rien ; puis suppression définitive depuis la corbeille', async () => {
    await expect(h(bulkRestorePages)({ ids }, ctx())).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await state()).find((r) => r.id === ids[1])!.deletedAt).not.toBeNull();
    expect(await h(bulkDeletePages)({ ids: [ids[1]] }, ctx())).toMatchObject({ count: 1 });
    expect((await state()).map((r) => r.id)).toEqual([ids[0]]);
  });
});
