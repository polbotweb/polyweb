import { and, eq, lte, sql, type SQLWrapper } from "drizzle-orm";
import { blogPosts } from "@database/schemas";

export function publicBlogPostColumnsScope(
  status: SQLWrapper,
  publishedAt: SQLWrapper,
) {
  return and(
    eq(status, "PUBLISHED"),
    lte(publishedAt, sql`now()`),
  );
}

/**
 * Canonical predicate for a post that may be exposed by a public endpoint.
 *
 * Publication status alone is insufficient: scheduled posts remain private
 * until their publication timestamp is reached.
 */
export function publicBlogPostScope(table: typeof blogPosts = blogPosts) {
  return publicBlogPostColumnsScope(table.status, table.publishedAt);
}
