import { assertBlogPermission, resolveBlogTenant, auditBlog, blogOrganizationIdSchema, blogPublicRateLimit, invalidateBlogCache } from "./_helpers";
import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, desc, isNull, or } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { blogReports, blogComments, blogPostReviews, blogPosts } from "@database/schemas";
import { blogReportFormSchema, blogReportStatusSchema } from "@/lib/blog/validation";
import { publicBlogPostScope } from "@/lib/blog/public-visibility";

export const createBlogReport = defineAction({
  input: blogReportFormSchema,
  handler: async (input, context) => {
    blogPublicRateLimit(context, "report-create", { window: 600, max: 10 });
    const user = context.locals.user;
    const db = getDrizzle();

    const targetCount = Number(Boolean(input.postId))
      + Number(Boolean(input.commentId))
      + Number(Boolean(input.reviewId));
    if (targetCount !== 1) {
      throw new ActionError({ code: "BAD_REQUEST", message: "Un seul élément peut être signalé à la fois." });
    }

    let subjectExists = false;
    if (input.postId) {
      const [post] = await db
        .select({ id: blogPosts.id })
        .from(blogPosts)
        .where(and(eq(blogPosts.id, input.postId), publicBlogPostScope(blogPosts)))
        .limit(1);
      subjectExists = Boolean(post);
    } else if (input.commentId) {
      const [comment] = await db
        .select({ id: blogComments.id })
        .from(blogComments)
        .innerJoin(blogPosts, eq(blogComments.postId, blogPosts.id))
        .where(
          and(
            eq(blogComments.id, input.commentId),
            eq(blogComments.status, "APPROVED"),
            publicBlogPostScope(blogPosts),
          ),
        )
        .limit(1);
      subjectExists = Boolean(comment);
    } else if (input.reviewId) {
      const [review] = await db
        .select({ id: blogPostReviews.id })
        .from(blogPostReviews)
        .innerJoin(blogPosts, eq(blogPostReviews.postId, blogPosts.id))
        .where(
          and(
            eq(blogPostReviews.id, input.reviewId),
            eq(blogPostReviews.status, "APPROVED"),
            publicBlogPostScope(blogPosts),
          ),
        )
        .limit(1);
      subjectExists = Boolean(review);
    }

    if (!subjectExists) {
      throw new ActionError({ code: "NOT_FOUND", message: "Élément public introuvable." });
    }

    const [report] = await db
      .insert(blogReports)
      .values({
        postId: input.postId ?? null,
        commentId: input.commentId ?? null,
        reviewId: input.reviewId ?? null,
        reporterId: user?.id ?? null,
        reason: input.reason,
        description: input.description,
        status: "PENDING",
      })
      .returning();

    invalidateBlogCache();
    return { id: report.id };
  },
});

export const updateBlogReport = defineAction({
  input: z.object({
    reportId: z.uuid(),
    status: blogReportStatusSchema,
    organizationId: blogOrganizationIdSchema,
  }),
  handler: async (input, context) => {
    const tenant = resolveBlogTenant(input);
    const user = await assertBlogPermission(context, tenant, { blogComment: ["moderate"] });

    const db = getDrizzle();

    // A report may target a post directly, or a comment/review (postId is null).
    // Resolve the owning post to enforce tenant isolation in both cases.
    const [report] = await db
      .select({
        id: blogReports.id,
        postId: blogReports.postId,
        commentId: blogReports.commentId,
        reviewId: blogReports.reviewId,
      })
      .from(blogReports)
      .where(eq(blogReports.id, input.reportId))
      .limit(1);

    if (!report) throw new ActionError({ code: "NOT_FOUND", message: "Signalement introuvable." });

    const targetCount = Number(Boolean(report.postId))
      + Number(Boolean(report.commentId))
      + Number(Boolean(report.reviewId));
    if (targetCount !== 1) {
      throw new ActionError({ code: "BAD_REQUEST", message: "Le signalement possède une cible invalide." });
    }

    const orgFilter =
      tenant.organizationId === null
        ? isNull(blogPosts.organizationId)
        : eq(blogPosts.organizationId, tenant.organizationId);

    let owningPostId: string | null = report.postId;
    if (!owningPostId && report.commentId) {
      const [comment] = await db
        .select({ postId: blogComments.postId })
        .from(blogComments)
        .where(eq(blogComments.id, report.commentId))
        .limit(1);
      owningPostId = comment?.postId ?? null;
    }
    if (!owningPostId && report.reviewId) {
      const [review] = await db
        .select({ postId: blogPostReviews.postId })
        .from(blogPostReviews)
        .where(eq(blogPostReviews.id, report.reviewId))
        .limit(1);
      owningPostId = review?.postId ?? null;
    }

    if (!owningPostId) {
      throw new ActionError({ code: "NOT_FOUND", message: "La cible du signalement est introuvable." });
    }

    const [post] = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(and(eq(blogPosts.id, owningPostId), orgFilter))
      .limit(1);
    if (!post) throw new ActionError({ code: "FORBIDDEN", message: "Ce signalement n'appartient pas à ce tenant." });

    await db
      .update(blogReports)
      .set({ status: input.status, resolvedBy: user.id, resolvedAt: new Date() })
      .where(eq(blogReports.id, input.reportId));

    auditBlog(context, user.id, "BLOG_REPORT_RESOLVE", {
      resource: "blog_reports",
      resourceId: input.reportId,
      metadata: { status: input.status },
    });

    invalidateBlogCache();
    return { success: true };
  },
});

export const getBlogModerationQueue = defineAction({
  input: z.object({
    organizationId: blogOrganizationIdSchema,
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  handler: async (input, context) => {
    const tenant = resolveBlogTenant(input);
    await assertBlogPermission(context, tenant, { blogComment: ["moderate"] });

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
        report: blogReports,
        post: { id: blogPosts.id, slug: blogPosts.slug },
      })
      .from(blogReports)
      .leftJoin(blogComments, eq(blogReports.commentId, blogComments.id))
      .leftJoin(blogPostReviews, eq(blogReports.reviewId, blogPostReviews.id))
      .leftJoin(
        blogPosts,
        or(
          eq(blogReports.postId, blogPosts.id),
          eq(blogComments.postId, blogPosts.id),
          eq(blogPostReviews.postId, blogPosts.id),
        ),
      )
      .where(and(eq(blogReports.status, "PENDING"), orgFilter))
      .orderBy(desc(blogReports.createdAt))
      .limit(input.limit)
      .offset(offset);

    return { comments: pendingComments, reviews: pendingReviews, reports: pendingReports };
  },
});
