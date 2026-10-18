/**
 * bulkBlogPostLifecycle sur le moteur générique core/bulk — base réelle (pas de mock de données).
 * Tout ou rien : publication groupée (révisions + audit avec batchId commun) ; transition invalide
 * → BAD_REQUEST sans aucune écriture ; élément hors périmètre → FORBIDDEN.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: any) => def };
});

import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { auditLog, blogPostRevisions, blogPostTranslations, blogPosts, user } from '@database/schemas';
import { bulkBlogPostLifecycle } from '@/actions/blog/bulk';
import { resetRateLimiter } from '@/lib/rate-limit';

const bulk = (bulkBlogPostLifecycle as any).handler as (i: any, c: any) => Promise<any>;
const db = getDrizzle();
const t = `bulk-${Date.now().toString(36)}`;
const admin = `${t}-admin`;
const ids = [crypto.randomUUID(), crypto.randomUUID()];
const ctx = () => ({ locals: { user: { id: admin, role: 'admin', email: `${admin}@test.local`, banned: false }, session: { id: `${t}-s` } }, request: { headers: new Headers() }, clientAddress: '127.0.0.1' }) as any;

beforeAll(async () => {
  await db.insert(user).values({ id: admin, name: 'Bulk admin', email: `${admin}@test.local`, role: 'admin' });
  await db.insert(blogPosts).values(ids.map((id, i) => ({ id, authorId: admin, slug: `${t}-${i}`, status: 'DRAFT' as const })));
  await db.insert(blogPostTranslations).values(ids.map((id, i) => ({ postId: id, locale: 'fr' as const, title: `Bulk ${i}`, slug: `${t}-${i}`, content: '<p>x</p>', excerpt: 'x' })));
});

afterAll(async () => {
  await db.delete(blogPosts).where(inArray(blogPosts.id, ids));
  await db.delete(user).where(eq(user.id, admin));
});

describe('bulkBlogPostLifecycle (core/bulk)', () => {
  it('publie tout, crée une révision par article et audite avec un batchId commun', async () => {
    resetRateLimiter();
    expect(await bulk({ ids, organizationId: null, operation: 'publish' }, ctx())).toEqual({ updated: 2 });
    const rows = await db.select({ status: blogPosts.status }).from(blogPosts).where(inArray(blogPosts.id, ids));
    expect(rows.every((r) => r.status === 'PUBLISHED')).toBe(true);
    expect((await db.select().from(blogPostRevisions).where(inArray(blogPostRevisions.postId, ids))).length).toBe(2);
    // L'audit est écrit sans bloquer l'action : attente bornée.
    let audits: Array<{ metadata: unknown }> = [];
    for (let i = 0; i < 50 && audits.length < 2; i++) {
      audits = await db.select({ metadata: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.action, 'BLOG_POST_PUBLISH'), inArray(auditLog.resourceId, ids)));
      if (audits.length < 2) await new Promise((r) => setTimeout(r, 50));
    }
    expect(audits.length).toBe(2);
    expect(new Set(audits.map((a) => (a.metadata as any).batchId)).size).toBe(1);
    expect(audits.every((a) => (a.metadata as any).bulk === true)).toBe(true);
  });

  it('transition invalide sur une ligne → BAD_REQUEST, aucune écriture', async () => {
    await db.update(blogPosts).set({ status: 'DELETED' }).where(eq(blogPosts.id, ids[1]!));
    const before = (await db.select({ n: sql<number>`count(*)::int` }).from(blogPostRevisions).where(inArray(blogPostRevisions.postId, ids)))[0]!.n;
    await expect(bulk({ ids, organizationId: null, operation: 'archive' }, ctx())).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const rows = await db.select({ id: blogPosts.id, status: blogPosts.status }).from(blogPosts).where(inArray(blogPosts.id, ids));
    expect(rows.find((r) => r.id === ids[0])!.status).toBe('PUBLISHED');
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(blogPostRevisions).where(inArray(blogPostRevisions.postId, ids)))[0]!.n).toBe(before);
  });

  it('élément inexistant / hors tenant → FORBIDDEN', async () => {
    await expect(bulk({ ids: [ids[0], crypto.randomUUID()], organizationId: null, operation: 'archive' }, ctx())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
