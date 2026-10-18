import { and, count, eq, isNull, or } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { blogComments, blogPostReviews, blogReports, blogPosts } from "@database/schemas";

function postTenantScope(organizationId: string | null) {
  return organizationId === null ? isNull(blogPosts.organizationId) : eq(blogPosts.organizationId, organizationId);
}

export async function getBlogAdminModerationCount(organizationId: string | null) {
  const db = getDrizzle();
  const scope = postTenantScope(organizationId);
  const [comments, reviews, postReports, commentReports, reviewReports] = await Promise.all([
    db.select({ count: count() }).from(blogComments).innerJoin(blogPosts, eq(blogPosts.id, blogComments.postId)).where(and(scope, or(eq(blogComments.status, "PENDING"), eq(blogComments.status, "SPAM")))),
    db.select({ count: count() }).from(blogPostReviews).innerJoin(blogPosts, eq(blogPosts.id, blogPostReviews.postId)).where(and(scope, eq(blogPostReviews.status, "PENDING"))),
    db.select({ count: count() }).from(blogReports).innerJoin(blogPosts, eq(blogPosts.id, blogReports.postId)).where(and(scope, eq(blogReports.status, "PENDING"))),
    db.select({ count: count() }).from(blogReports).innerJoin(blogComments, eq(blogComments.id, blogReports.commentId)).innerJoin(blogPosts, eq(blogPosts.id, blogComments.postId)).where(and(scope, eq(blogReports.status, "PENDING"))),
    db.select({ count: count() }).from(blogReports).innerJoin(blogPostReviews, eq(blogPostReviews.id, blogReports.reviewId)).innerJoin(blogPosts, eq(blogPosts.id, blogPostReviews.postId)).where(and(scope, eq(blogReports.status, "PENDING"))),
  ]);

  return Number(comments[0]?.count ?? 0)
    + Number(reviews[0]?.count ?? 0)
    + Number(postReports[0]?.count ?? 0)
    + Number(commentReports[0]?.count ?? 0)
    + Number(reviewReports[0]?.count ?? 0);
}
