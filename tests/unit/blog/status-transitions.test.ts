import { describe, expect, it } from "vitest";
import {
  assertValidBlogPostTransition,
  BLOG_POST_TRANSITIONS,
  type BlogPostStatus,
} from "@/lib/blog/constants";

describe("blog post status transitions", () => {
  const legal: [BlogPostStatus, BlogPostStatus][] = [
    ["DRAFT", "PUBLISHED"],
    ["DRAFT", "ARCHIVED"],
    ["DRAFT", "DELETED"],
    ["PUBLISHED", "DRAFT"],
    ["PUBLISHED", "ARCHIVED"],
    ["PUBLISHED", "DELETED"],
    ["ARCHIVED", "DRAFT"],
    ["ARCHIVED", "DELETED"],
    ["DELETED", "DRAFT"],
  ];

  const illegal: [BlogPostStatus, BlogPostStatus][] = [
    ["DRAFT", "DRAFT"],
    ["PUBLISHED", "PUBLISHED"],
    ["ARCHIVED", "ARCHIVED"],
    ["DELETED", "DELETED"],
    ["ARCHIVED", "PUBLISHED"],
    ["DELETED", "PUBLISHED"],
    ["DELETED", "ARCHIVED"],
  ];

  it("contains exactly the documented transition graph", () => {
    expect(BLOG_POST_TRANSITIONS).toEqual({
      DRAFT: ["PUBLISHED", "ARCHIVED", "DELETED"],
      PUBLISHED: ["DRAFT", "ARCHIVED", "DELETED"],
      ARCHIVED: ["DRAFT", "DELETED"],
      DELETED: ["DRAFT"],
    });
  });

  it.each(legal)("accepts %s -> %s", (from, to) => {
    expect(() => assertValidBlogPostTransition(from, to)).not.toThrow();
  });

  it.each(illegal)("rejects %s -> %s", (from, to) => {
    expect(() => assertValidBlogPostTransition(from, to)).toThrow(
      `Invalid blog post status transition: ${from} → ${to}.`,
    );
  });
});
