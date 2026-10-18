import type { APIRoute } from "astro";
import { and, lte, eq, isNull, isNotNull, lt } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { pages } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { timingSafeEqual } from "node:crypto";

export const prerender = false;

const CRON_SECRET = process.env.CRON_SECRET;

function isAuthorized(request: Request): boolean {
  if (!CRON_SECRET) {
    // No secret configured — reject all requests in production.
    // In dev/test, allow only when no proxy is involved (direct loopback).
    if (process.env.NODE_ENV === "production") return false;
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return false;
    return true;
  }
  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (token.length !== CRON_SECRET.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(CRON_SECRET));
}

/**
 * POST /api/cron/publish
 *
 * Handles three scheduled tasks:
 * 1. Auto-publish pages where scheduledAt <= now
 * 2. Auto-unpublish pages where scheduledUnpublishAt <= now
 * 3. Auto-purge trashed pages older than 30 days
 *
 * Call from external cron (e.g. every minute) or container scheduler.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!isAuthorized(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const db = getDrizzle();
  const results = { published: 0, unpublished: 0, purged: 0 };

  // 1. Auto-publish scheduled pages
  try {
    const published = await db
      .update(pages)
      .set({ isPublished: true, publishedAt: now, scheduledAt: null })
      .where(
        and(
          isNotNull(pages.scheduledAt),
          lte(pages.scheduledAt, now),
          eq(pages.isPublished, false),
          isNull(pages.deletedAt),
        ),
      )
      .returning({ id: pages.id });
    results.published = published.length;
  } catch (err) {
    console.error("[cron/publish] Auto-publish failed:", err);
  }

  // 2. Auto-unpublish pages with expired scheduledUnpublishAt
  try {
    const unpublished = await db
      .update(pages)
      .set({ isPublished: false, scheduledUnpublishAt: null })
      .where(
        and(
          isNotNull(pages.scheduledUnpublishAt),
          lte(pages.scheduledUnpublishAt, now),
          eq(pages.isPublished, true),
          isNull(pages.deletedAt),
        ),
      )
      .returning({ id: pages.id });
    results.unpublished = unpublished.length;
  } catch (err) {
    console.error("[cron/publish] Auto-unpublish failed:", err);
  }

  // 3. Auto-purge trashed pages older than 30 days
  try {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const purged = await db
      .delete(pages)
      .where(
        and(
          isNotNull(pages.deletedAt),
          lt(pages.deletedAt, thirtyDaysAgo),
        ),
      )
      .returning({ id: pages.id });
    results.purged = purged.length;
  } catch (err) {
    console.error("[cron/publish] Trash purge failed:", err);
  }

  if (results.published > 0 || results.unpublished > 0 || results.purged > 0) {
    invalidateCache("page:");
  }

  return new Response(JSON.stringify({ ok: true, ...results }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};
