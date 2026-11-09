import { Effect } from "effect";
import { resolveBlogTenant, blogOrganizationIdSchema, invalidateBlogCache, requireBlogPermission, blogPublicRateLimitEffect } from "./_helpers";
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, desc, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { blogComments, blogPostReviews, blogPosts, moderationReports, MODERATION_REPORT_REASONS } from "@database/schemas";
import { blogReportFormSchema, blogReportStatusSchema } from "@/lib/blog/validation";
import { ActionFailure, actionTry, effectHandler, fail } from "@/lib/effect/action";
import { resolveModerationReports } from "@/core/moderation/service";
import { registerModerationTargets } from "@/modules/moderation";
import { reportModerationTarget } from "@/actions/moderation";

/**
 * Façade historique du signalement blog : délègue au signalement générique (`moderation.report`,
 * docs/moderation.md) — dédoublonné, sans identifiant de signalement en retour.
 */
export const createBlogReport = defineAction({
  input: blogReportFormSchema,
  handler: effectHandler((input, context) => Effect.gen(function* () {
    yield* blogPublicRateLimitEffect(context, "report-create", { window: 600, max: 10 });
    const [type, id] = input.postId ? ["post", input.postId] : input.commentId ? ["comment", input.commentId] : ["review", input.reviewId ?? ""];
    const reason = input.reason.toLowerCase() as (typeof MODERATION_REPORT_REASONS)[number];
    yield* reportModerationTarget({ target: `blog.${type}`, id, reason: MODERATION_REPORT_REASONS.includes(reason) ? reason : "other", description: input.description ?? null }, context);
    return { success: true };
  })),
});

/**
 * Façade historique : clôt UN signalement générique du blog. `REVIEWED` n'existe plus (le
 * signalement reste ouvert) ; `RESOLVED` → resolved, `REJECTED` → dismissed.
 */
export const updateBlogReport = defineAction({
  input: z.object({
    reportId: z.uuid(),
    status: blogReportStatusSchema,
    organizationId: blogOrganizationIdSchema,
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blogComment: ["moderate"] });
    const [report] = yield* actionTry("blog/moderation.updateBlogReport", () =>
      getDrizzle()
        .select({ id: moderationReports.id, targetType: moderationReports.targetType, targetId: moderationReports.targetId, organizationId: moderationReports.organizationId })
        .from(moderationReports)
        .where(and(eq(moderationReports.id, input.reportId), eq(moderationReports.module, "blog")))
        .limit(1),
    );
    if (!report || report.organizationId !== tenant.organizationId) return yield* fail("NOT_FOUND", "Signalement introuvable.");
    if (input.status === "REVIEWED" || input.status === "PENDING") return { success: true };
    registerModerationTargets();
    yield* resolveModerationReports({
      key: `blog.${report.targetType}`,
      targetId: report.targetId,
      outcome: input.status === "RESOLVED" ? "resolved" : "dismissed",
      actorId: user.id,
      organizationId: report.organizationId,
      siteId: null,
      note: "Traité depuis la file historique du blog.",
      reportId: report.id,
    }).pipe(Effect.mapError((e) => (e._tag === "ModerationUnavailableError" ? new ActionFailure({ code: "NOT_FOUND", message: "Signalement introuvable." }) : e)));
    invalidateBlogCache();
    return { success: true };
  })),
});

export const getBlogModerationQueue = defineAction({
  input: z.object({
    organizationId: blogOrganizationIdSchema,
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    yield* requireBlogPermission(context, tenant, { blogComment: ["moderate"] });
    return yield* actionTry("blog/moderation.getBlogModerationQueue", async () => {

    const db = getDrizzle();
    const offset = (input.page - 1) * input.limit;

    const orgFilter = tenant.organizationId === null
      ? isNull(blogPosts.organizationId)
      : eq(blogPosts.organizationId, tenant.organizationId);

    const pendingComments = await db
      .select({
        comment: blogComments,
        post: { id: blogPosts.id, slug: blogPosts.slug },
      })
      .from(blogComments)
      .innerJoin(blogPosts, eq(blogComments.postId, blogPosts.id))
      .where(and(eq(blogComments.status, "PENDING"), orgFilter))
      .orderBy(desc(blogComments.createdAt))
      .limit(input.limit)
      .offset(offset);

    const pendingReviews = await db
      .select({
        review: blogPostReviews,
        post: { id: blogPosts.id, slug: blogPosts.slug },
      })
      .from(blogPostReviews)
      .innerJoin(blogPosts, eq(blogPostReviews.postId, blogPosts.id))
      .where(and(eq(blogPostReviews.status, "PENDING"), orgFilter))
      .orderBy(desc(blogPostReviews.createdAt))
      .limit(input.limit)
      .offset(offset);

    const pendingReports = await db
      .select({
        report: { id: moderationReports.id, targetType: moderationReports.targetType, targetId: moderationReports.targetId, reason: moderationReports.reason, description: moderationReports.description, status: moderationReports.status, createdAt: moderationReports.createdAt },
      })
      .from(moderationReports)
      .where(and(eq(moderationReports.module, "blog"), eq(moderationReports.status, "open"), tenant.organizationId === null ? isNull(moderationReports.organizationId) : eq(moderationReports.organizationId, tenant.organizationId)))
      .orderBy(desc(moderationReports.createdAt))
      .limit(input.limit)
      .offset(offset);

    return { comments: pendingComments, reviews: pendingReviews, reports: pendingReports };
  }); })),
});
