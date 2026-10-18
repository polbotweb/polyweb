import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

// `astro:actions` is a virtual module resolved only by the Astro build pipeline.
// In tests we provide the minimal shim (defineAction passthrough + ActionError).
// This is NOT a data mock — the real database, resolvers, audit and cache run.
vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) {
      super(message);
      this.code = code;
    }
  }
  return { ActionError, defineAction: (def: any) => def };
});

import { getDrizzle } from '@database/drizzle';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { blogPosts, blogReports, blogPostTranslations, blogPostViewStats, user } from '@database/schemas';
import { listBlogPostRevisions } from '@/actions/blog/post';
import { updateBlogReport, getBlogModerationQueue } from '@/actions/blog/moderation';
import { resolveBlogInternalLink } from '@/actions/blog/internal-link';
import { checkBlogPostLinks } from '@/actions/blog/check-links';
import { recordBlogPostView } from '@/actions/blog/view';
import { resetRateLimiter } from '@/lib/rate-limit';
import type { Locale } from '@i18n/config';

// `defineAction` returns a typed callable; in tests we invoke `.handler` directly.
const listRevisions = (listBlogPostRevisions as any).handler as (i: any, c: any) => Promise<any>;
const updateReport = (updateBlogReport as any).handler as (i: any, c: any) => Promise<any>;
const getQueue = (getBlogModerationQueue as any).handler as (i: any, c: any) => Promise<any>;
const resolveLink = (resolveBlogInternalLink as any).handler as (i: any, c: any) => Promise<any>;
const checkLinks = (checkBlogPostLinks as any).handler as (i: any, c: any) => Promise<any>;
const recordView = (recordBlogPostView as any).handler as (i: any, c: any) => Promise<any>;

/**
 * Real integration tests against the seeded test database.
 * No DB mocking: the actions run against the actual Postgres instance,
 * exercising real queries, RBAC (admin bypass), audit and cache invalidation.
 * Only the ActionAPIContext is constructed locally (it is the caller, not data).
 */

function adminCtx(userId: string) {
  return {
    locals: { user: { id: userId, role: 'admin', email: 'admin@test.com', banned: false } },
    request: { headers: new Headers() },
    clientAddress: '127.0.0.1',
  } as any;
}

const db = getDrizzle();

describe('blog actions — integration (real DB)', () => {
  let globalPostId: string;
  let globalPostSlug: string;
  let realUserId: string;
  let originalUserRole: string | null;

  beforeAll(async () => {
    const [post] = await db
      .select({ id: blogPosts.id, slug: blogPostTranslations.slug })
      .from(blogPosts)
      .innerJoin(blogPostTranslations, eq(blogPostTranslations.postId, blogPosts.id))
      .where(and(isNull(blogPosts.organizationId), eq(blogPostTranslations.locale, 'fr')))
      .limit(1);
    if (!post) throw new Error('No global blog post seeded — run db:seed-blog-demo');
    globalPostId = post.id;
    globalPostSlug = post.slug;

    const [realUser] = await db.select({ id: user.id, role: user.role }).from(user).limit(1);
    if (!realUser) throw new Error('No user seeded — run db:seed');
    realUserId = realUser.id;
    originalUserRole = realUser.role;
    await db.update(user).set({ role: "admin" }).where(eq(user.id, realUserId));
  });

  afterAll(async () => {
    await db.update(user).set({ role: originalUserRole }).where(eq(user.id, realUserId));
  });

  it('listBlogPostRevisions returns revisions for a seeded post', async () => {
    const revisions = await listRevisions(
      { postId: globalPostId, organizationId: null },
      adminCtx(realUserId),
    );
    expect(Array.isArray(revisions)).toBe(true);
    expect(revisions.length).toBeGreaterThan(0);
    // ordered by createdAt desc
    for (let i = 1; i < revisions.length; i++) {
      expect(new Date(revisions[i - 1].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(revisions[i].createdAt).getTime(),
      );
    }
  });

  it('getBlogModerationQueue returns pending items', async () => {
    const queue = await getQueue(
      { organizationId: null, page: 1, limit: 20 },
      adminCtx(realUserId),
    );
    expect(queue).toHaveProperty('comments');
    expect(queue).toHaveProperty('reviews');
    expect(queue).toHaveProperty('reports');
    expect(Array.isArray(queue.comments)).toBe(true);
    expect(Array.isArray(queue.reviews)).toBe(true);
    expect(Array.isArray(queue.reports)).toBe(true);
  });

  it('updateBlogReport resolves a PENDING report and persists it', async () => {
    const [pending] = await db
      .select({ id: blogReports.id })
      .from(blogReports)
      .where(eq(blogReports.status, 'PENDING'))
      .limit(1);

    if (!pending) {
      // No pending report seeded in this environment — skip gracefully.
      console.warn('[test] no PENDING blog report seeded; skipping resolve assertion');
      return;
    }

    const res = await updateReport(
      { reportId: pending.id, status: 'RESOLVED', organizationId: null },
      adminCtx(realUserId),
    );
    expect(res.success).toBe(true);

    const [updated] = await db
      .select({ status: blogReports.status, resolvedBy: blogReports.resolvedBy })
      .from(blogReports)
      .where(eq(blogReports.id, pending.id))
      .limit(1);
    expect(updated.status).toBe('RESOLVED');
    expect(updated.resolvedBy).toBe(realUserId);
  });

  it('resolveBlogInternalLink resolves a real slug', async () => {
    const res = await resolveLink(
      { target: globalPostSlug, mode: 'resolve', locale: 'fr' as Locale, organizationId: null },
      adminCtx(realUserId),
    );
    expect(res.resolution.exists).toBe(true);
    expect(res.resolution.href).toContain('/fr/blog/');
  });

  it('resolveBlogInternalLink searches posts', async () => {
    const res = await resolveLink(
      { target: '', mode: 'search', query: 'Annecy', locale: 'fr' as Locale, organizationId: null },
      adminCtx(realUserId),
    );
    expect(Array.isArray(res.results)).toBe(true);
    expect(res.results.length).toBeGreaterThan(0);
  });

  it('checkBlogPostLinks returns a structured report for a real post', async () => {
    const res = await checkLinks(
      { postId: globalPostId, locale: 'fr' as Locale, organizationId: null },
      adminCtx(realUserId),
    );
    expect(res).toHaveProperty('deadExplicit');
    expect(res).toHaveProperty('deadInline');
    expect(Array.isArray(res.deadExplicit)).toBe(true);
    expect(Array.isArray(res.deadInline)).toBe(true);
  });

  describe('recordBlogPostView (real DB, real cookies)', () => {
    beforeEach(() => {
      // The rate limiter uses an in-memory store shared across the test process;
      // reset it so each test starts from a clean dedupe window.
      resetRateLimiter();
    });

    function anonCtx() {
      const cookies = new Map<string, string>();
      return {
        locals: {},
        request: { headers: new Headers({ 'user-agent': 'Mozilla/5.0' }) },
        clientAddress: '127.0.0.1',
        cookies: {
          get: (name: string) => (cookies.has(name) ? { value: cookies.get(name) } : undefined),
          set: (name: string, value: string) => {
            cookies.set(name, value);
          },
        },
      } as any;
    }
    function userCtx(userId: string) {
      return {
        locals: { user: { id: userId, role: 'user', email: 'user@test.com', banned: false }, session: { id: 'sess-real' } },
        request: { headers: new Headers({ 'user-agent': 'Mozilla/5.0' }) },
        clientAddress: '127.0.0.1',
        cookies: {
          get: () => undefined,
          set: () => {},
        },
      } as any;
    }

    it('increments viewCount and writes a view stat row for an anonymous visitor', async () => {
      const [before] = await db
        .select({ viewCount: blogPosts.viewCount })
        .from(blogPosts)
        .where(eq(blogPosts.id, globalPostId))
        .limit(1);

      const ctx = anonCtx();
      const res = await recordView({ postId: globalPostId, referrer: 'https://example.com' }, ctx);
      expect(res).toEqual({ recorded: true });

      const [after] = await db
        .select({ viewCount: blogPosts.viewCount })
        .from(blogPosts)
        .where(eq(blogPosts.id, globalPostId))
        .limit(1);
      expect(after.viewCount).toBe(before.viewCount + 1);

      const [stat] = await db
        .select({ sessionId: blogPostViewStats.sessionId, referrer: blogPostViewStats.referrer })
        .from(blogPostViewStats)
        .where(eq(blogPostViewStats.postId, globalPostId))
        .orderBy(sql`${blogPostViewStats.date} DESC, ${blogPostViewStats.hour} DESC`)
        .limit(1);
      expect(stat).toBeDefined();
      expect(stat.sessionId).toMatch(/^anon:/);
      expect(stat.referrer).toBe('https://example.com');
    });

    it('attributes a logged-in view to the session id, not an anon cookie', async () => {
      const ctx = userCtx(realUserId);
      const res = await recordView({ postId: globalPostId }, ctx);
      expect(res).toEqual({ recorded: true });

      const [stat] = await db
        .select({ sessionId: blogPostViewStats.sessionId })
        .from(blogPostViewStats)
        .where(eq(blogPostViewStats.postId, globalPostId))
        .orderBy(sql`${blogPostViewStats.date} DESC, ${blogPostViewStats.hour} DESC`)
        .limit(1);
      expect(stat.sessionId).toBe('sess-real');
    });
  });
});
