import { assertBlogPermission, resolveBlogTenant, auditBlog, blogOrganizationIdSchema, blogRateLimit, invalidateBlogCache } from "./_helpers";
import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, count, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { blogPostReviews, blogPostReviewHelpful, blogPosts, blogNotifications } from "@database/schemas";
import { sanitizeHtml } from "@/lib/sanitize";
import { blogReviewFormSchema, blogReviewModerationSchema } from "@/lib/blog/validation";
import { publicBlogPostScope } from "@/lib/blog/public-visibility";
import { extractIp } from "@/lib/audit";

export const createBlogReview = defineAction({
  input: blogReviewFormSchema,
  handler: async (input, context) => {
    const user = context.locals.user;
    if (!user) {
      throw new ActionError({ code: "UNAUTHORIZED", message: "Vous devez être connecté pour laisser un avis." });
    }
    blogRateLimit(context, user.id, "review-create", { window: 3600, max: 10 });

    const content = sanitizeHtml(input.content);
    const db = getDrizzle();
    const review = await db.transaction(async (tx) => {
      const [post] = await tx
        .select({
          id: blogPosts.id,
          allowReviews: blogPosts.allowReviews,
          authorId: blogPosts.authorId,
          organizationId: blogPosts.organizationId,
        })
        .from(blogPosts)
        .where(and(eq(blogPosts.id, input.postId), publicBlogPostScope(blogPosts)))
        .limit(1);

      if (!post) throw new ActionError({ code: "NOT_FOUND", message: "Article introuvable." });
      if (!post.allowReviews) {
        throw new ActionError({ code: "FORBIDDEN", message: "Les avis sont désactivés pour cet article." });
      }

      const [createdReview] = await tx
        .insert(blogPostReviews)
        .values({
          postId: input.postId,
          authorId: user.id,
          rating: input.rating,
          title: input.title,
          content,
          isRecommended: input.isRecommended ?? true,
          status: "PENDING",
          ipAddress: extractIp(context.request.headers, context.clientAddress),
        })
        .returning();

      if (post.authorId !== user.id) {
        await tx.insert(blogNotifications).values({
          userId: post.authorId,
          organizationId: post.organizationId,
          type: "NEW_REVIEW",
          postId: input.postId,
          reviewId: createdReview.id,
          fromUserId: user.id,
          metadata: { rating: input.rating },
        });
      }

      return createdReview;
    });

    invalidateBlogCache();
    return { id: review.id, status: review.status };
  },
});

export const moderateBlogReview = defineAction({
  input: blogReviewModerationSchema.extend({
    organizationId: blogOrganizationIdSchema,
  }),
  handler: async (input, context) => {
    const tenant = resolveBlogTenant(input);
    const user = await assertBlogPermission(context, tenant, { blogReview: ["moderate"] });

    const db = getDrizzle();
    await db.transaction(async (tx) => {
      const [review] = await tx
        .select({
          id: blogPostReviews.id,
          authorId: blogPostReviews.authorId,
          status: blogPostReviews.status,
          postId: blogPostReviews.postId,
          organizationId: blogPosts.organizationId,
        })
        .from(blogPostReviews)
        .innerJoin(blogPosts, eq(blogPostReviews.postId, blogPosts.id))
        .where(
          and(
            eq(blogPostReviews.id, input.reviewId),
            tenant.organizationId === null
              ? isNull(blogPosts.organizationId)
              : eq(blogPosts.organizationId, tenant.organizationId),
          ),
        )
        .limit(1);

      if (!review) throw new ActionError({ code: "NOT_FOUND", message: "Avis introuvable." });

      await tx
        .update(blogPostReviews)
        .set({ status: input.status })
        .where(eq(blogPostReviews.id, input.reviewId));

      if (
        input.status === "APPROVED"
        && review.status !== input.status
        && review.authorId
        && review.authorId !== user.id
      ) {
        await tx.insert(blogNotifications).values({
          userId: review.authorId,
          organizationId: review.organizationId,
          type: "REVIEW_APPROVED",
          reviewId: review.id,
          fromUserId: user.id,
        });
      }
    });

    auditBlog(context, user.id, "BLOG_REVIEW_MODERATE", {
      resource: "blog_post_reviews",
      resourceId: input.reviewId,
      metadata: { status: input.status },
    });

    invalidateBlogCache();
    return { success: true };
  },
});

export const voteBlogReviewHelpful = defineAction({
  input: z.object({
    reviewId: z.uuid(),
    isHelpful: z.boolean(),
  }),
  handler: async (input, context) => {
    const user = context.locals.user;
    if (!user) throw new ActionError({ code: "UNAUTHORIZED", message: "Connexion requise." });

    const db = getDrizzle();
    await db.transaction(async (tx) => {
      const [review] = await tx
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

      if (!review) throw new ActionError({ code: "NOT_FOUND", message: "Avis introuvable." });

      await tx
        .insert(blogPostReviewHelpful)
        .values({ reviewId: input.reviewId, userId: user.id, isHelpful: input.isHelpful })
        .onConflictDoUpdate({
          target: [blogPostReviewHelpful.reviewId, blogPostReviewHelpful.userId],
          set: { isHelpful: input.isHelpful },
        });

      const [{ helpful }] = await tx
        .select({ helpful: count() })
        .from(blogPostReviewHelpful)
        .where(and(eq(blogPostReviewHelpful.reviewId, input.reviewId), eq(blogPostReviewHelpful.isHelpful, true)));

      await tx
        .update(blogPostReviews)
        .set({ helpfulCount: Number(helpful) })
        .where(eq(blogPostReviews.id, input.reviewId));
    });

    invalidateBlogCache();
    return { success: true };
  },
});
