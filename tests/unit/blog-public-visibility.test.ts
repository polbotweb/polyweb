import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { blogPosts } from "@database/schemas";
import { publicBlogPostScope } from "@/lib/blog/public-visibility";

describe("publicBlogPostScope", () => {
  it("requires PUBLISHED status and a publication timestamp no later than database time", () => {
    const predicate = publicBlogPostScope(blogPosts);
    if (!predicate) throw new Error("Public post predicate must not be empty.");

    const query = new PgDialect().sqlToQuery(predicate);

    expect(query.sql).toContain('"blog_posts"."status" = $1');
    expect(query.sql).toContain('"blog_posts"."published_at" <= now()');
    expect(query.params).toEqual(["PUBLISHED"]);
  });
});
