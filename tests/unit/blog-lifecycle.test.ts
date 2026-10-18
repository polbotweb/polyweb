import { describe, expect, it } from "vitest";
import { assertValidBlogPostTransition, BLOG_POST_TRANSITIONS, type BlogPostStatus } from "@/lib/blog/constants";

describe("blog post lifecycle", () => {
  it("documents every legal transition", () => {
    const legal: Array<[BlogPostStatus, BlogPostStatus]> = Object.entries(BLOG_POST_TRANSITIONS)
      .flatMap(([from, targets]) => targets.map((to) => [from as BlogPostStatus, to] as [BlogPostStatus, BlogPostStatus]));

    for (const [from, to] of legal) expect(() => assertValidBlogPostTransition(from, to)).not.toThrow();
  });

  it("rejects every illegal transition", () => {
    const statuses: BlogPostStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED", "DELETED"];
    for (const from of statuses) {
      for (const to of statuses) {
        if (BLOG_POST_TRANSITIONS[from].includes(to)) continue;
        expect(() => assertValidBlogPostTransition(from, to)).toThrow(`Invalid blog post status transition: ${from} → ${to}.`);
      }
    }
  });
});
