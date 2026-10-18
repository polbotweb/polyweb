import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, sql } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { blogPosts, blogPostViewStats } from "@database/schemas";
import { checkRateLimit } from "@/lib/rate-limit";
import { publicBlogPostScope } from "@/lib/blog/public-visibility";
import { extractIp } from "@/lib/audit";

type DeviceType = "DESKTOP" | "MOBILE" | "TABLET";

/** Lightweight device-type sniff from User-Agent — no external UA-parser dependency needed. */
function detectDeviceType(userAgent: string | null): DeviceType | undefined {
  if (!userAgent) return undefined;
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|(android(?!.*mobile))/.test(ua)) return "TABLET";
  if (/mobi|iphone|ipod|android/.test(ua)) return "MOBILE";
  return "DESKTOP";
}

/**
 * Records a single public view of a blog post: increments `blogPosts.viewCount`
 * (atomic SQL increment, safe under concurrency) and appends a row to
 * `blogPostViewStats` for the analytics breakdown (date/hour/referrer/device).
 *
 * Called client-side (fire-and-forget) from the public post page — NOT during
 * SSR — so server-side prefetches/crawlers don't inflate counts as much as a
 * render-time increment would. De-duplicated per (post, visitor) for 30 minutes
 * via the rate limiter so repeat reloads from the same visitor don't inflate
 * counts. The visitor key combines the stable anonymous cookie (or session id)
 * with the IP, so two real users behind one NAT share a count (acceptable
 * under-count) while a single visitor on one IP is never double-counted.
 *
 * NOTE: a view does NOT invalidate the public blog cache. viewCount is a
 * counter, not a content mutation — purging blog:post:/blog:list: on every
 * pageview would defeat the cache entirely under traffic.
 */
export const recordBlogPostView = defineAction({
  input: z.object({
    postId: z.uuid(),
    referrer: z.string().trim().max(500).optional(),
  }),
  handler: async (input, context) => {
    const db = getDrizzle();
    const [visiblePost] = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(and(eq(blogPosts.id, input.postId), publicBlogPostScope(blogPosts)))
      .limit(1);
    if (!visiblePost) throw new ActionError({ code: "NOT_FOUND", message: "Article introuvable." });

    // Resolve the stable visitor id FIRST (cookie for anon, session for auth)
    // so it can drive de-duplication — not the IP alone.
    let visitorSessionId = context.locals.session?.id ?? null;
    if (!visitorSessionId) {
      const visitorCookie = context.cookies.get("atomic_visitor");
      if (visitorCookie?.value) {
        visitorSessionId = `anon:${visitorCookie.value}`;
      } else {
        const visitorId = crypto.randomUUID();
        context.cookies.set("atomic_visitor", visitorId, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          httpOnly: true,
          sameSite: "lax",
        });
        visitorSessionId = `anon:${visitorId}`;
      }
    }

    const ip = extractIp(context.request.headers, context.clientAddress);
    // Key on the stable visitor id (not IP alone) so the cookie actually
    // de-duplicates; fall back to IP only when no visitor id is available.
    const dedupeKey = `blog-view:${input.postId}:${visitorSessionId ?? ip ?? "__global__"}`;
    const rl = checkRateLimit(dedupeKey, { window: 1800, max: 1 });
    if (!rl.allowed) {
      // Already counted this visitor for this post in the last 30 minutes.
      return { recorded: false };
    }

    const now = new Date();
    const deviceType = detectDeviceType(context.request.headers.get("user-agent"));

    await db.transaction(async (tx) => {
      const [updatedPost] = await tx
        .update(blogPosts)
        .set({ viewCount: sql`${blogPosts.viewCount} + 1` })
        .where(and(eq(blogPosts.id, input.postId), publicBlogPostScope(blogPosts)))
        .returning({ id: blogPosts.id });

      if (!updatedPost) throw new ActionError({ code: "NOT_FOUND", message: "Article introuvable." });

      await tx.insert(blogPostViewStats).values({
        postId: input.postId,
        date: now.toISOString().slice(0, 10),
        hour: now.getUTCHours(),
        referrer: input.referrer?.slice(0, 500),
        deviceType,
        sessionId: visitorSessionId,
      });
    });

    // Views are recorded in blogPostViewStats (their own analytics table).
    // They are intentionally NOT written to audit_log: a view is a high-volume
    // fire-and-forget event, not a security/significant action, and logging
    // every view would bloat audit_log and slow real audit queries.
    return { recorded: true };
  },
});
