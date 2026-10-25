import { and, count, eq, isNull, or } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { blogComments, blogPostReviews, blogReports, blogPosts } from "@database/schemas";
import type { DbError } from "@/lib/effect/errors";
import { dbTry, runOrThrow } from "@/lib/effect/run";

function postTenantScope(organizationId: string | null) {
  return organizationId === null ? isNull(blogPosts.organizationId) : eq(blogPosts.organizationId, organizationId);
}

/** Total des éléments à modérer du tenant (commentaires, avis, signalements) : 5 comptes parallèles. */
const blogAdminModerationCountEffect = (organizationId: string | null): Effect.Effect<number, DbError> =>
  Effect.suspend(() => {
    const db = getDrizzle();
    const scope = postTenantScope(organizationId);
    return Effect.all(
      [
        dbTry("blogAdmin.pendingComments", () =>
          db.select({ count: count() }).from(blogComments).innerJoin(blogPosts, eq(blogPosts.id, blogComments.postId)).where(and(scope, or(eq(blogComments.status, "PENDING"), eq(blogComments.status, "SPAM")))),
        ),
        dbTry("blogAdmin.pendingReviews", () =>
          db.select({ count: count() }).from(blogPostReviews).innerJoin(blogPosts, eq(blogPosts.id, blogPostReviews.postId)).where(and(scope, eq(blogPostReviews.status, "PENDING"))),
        ),
        dbTry("blogAdmin.postReports", () =>
          db.select({ count: count() }).from(blogReports).innerJoin(blogPosts, eq(blogPosts.id, blogReports.postId)).where(and(scope, eq(blogReports.status, "PENDING"))),
        ),
        dbTry("blogAdmin.commentReports", () =>
          db.select({ count: count() }).from(blogReports).innerJoin(blogComments, eq(blogComments.id, blogReports.commentId)).innerJoin(blogPosts, eq(blogPosts.id, blogComments.postId)).where(and(scope, eq(blogReports.status, "PENDING"))),
        ),
        dbTry("blogAdmin.reviewReports", () =>
          db.select({ count: count() }).from(blogReports).innerJoin(blogPostReviews, eq(blogPostReviews.id, blogReports.reviewId)).innerJoin(blogPosts, eq(blogPosts.id, blogPostReviews.postId)).where(and(scope, eq(blogReports.status, "PENDING"))),
        ),
      ],
      { concurrency: "unbounded" },
    ).pipe(Effect.map((groups) => groups.reduce((sum, rows) => sum + Number(rows[0]?.count ?? 0), 0)));
  });

export const blogAdminModerationEffects = { getBlogAdminModerationCount: blogAdminModerationCountEffect };

export const getBlogAdminModerationCount = (organizationId: string | null): Promise<number> =>
  runOrThrow(blogAdminModerationCountEffect(organizationId));
