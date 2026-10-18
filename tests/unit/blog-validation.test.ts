import { describe, expect, it } from "vitest";
import { blogPostUpdateSchema } from "@/lib/blog/validation";

describe("blog post update schema", () => {
  it("rejects status changes through ordinary updates", () => {
    const result = blogPostUpdateSchema.safeParse({
      id: crypto.randomUUID(),
      status: "PUBLISHED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects publication-date changes through ordinary updates", () => {
    const result = blogPostUpdateSchema.safeParse({
      id: crypto.randomUUID(),
      publishedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("accepts editorial fields without lifecycle fields", () => {
    const result = blogPostUpdateSchema.safeParse({
      id: crypto.randomUUID(),
      locale: "fr",
      title: "Updated title",
      slug: "updated-title",
      content: "Updated content",
    });
    expect(result.success).toBe(true);
  });
});
