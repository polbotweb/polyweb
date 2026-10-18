import { describe, expect, it } from "vitest";
import { serviceAdminFiltersSchema } from "@/modules/services/validation";

describe("Services admin contract", () => {
  it("accepts every supported filter and normalizes booleans", () => {
    const result = serviceAdminFiltersSchema.parse({
      organizationId: "org-1",
      page: "2",
      limit: "50",
      search: "plombier",
      status: "PUBLISHED",
      categoryId: "00000000-0000-4000-8000-000000000001",
      tagId: "00000000-0000-4000-8000-000000000002",
      providerId: "user-1",
      featured: "false",
      mobile: "true",
      locale: "ar",
      sortBy: "publishedAt",
      sortOrder: "asc",
    });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
    expect(result.featured).toBe(false);
    expect(result.mobile).toBe(true);
    expect(result.locale).toBe("ar");
    expect(result.sortBy).toBe("publishedAt");
    expect(result.sortOrder).toBe("asc");
  });

  it("rejects invalid enum values and invalid UUID filters", () => {
    expect(serviceAdminFiltersSchema.safeParse({ status: "INVALID" }).success).toBe(false);
    expect(serviceAdminFiltersSchema.safeParse({ categoryId: "not-a-uuid" }).success).toBe(false);
    expect(serviceAdminFiltersSchema.safeParse({ sortBy: "unknown" }).success).toBe(false);
  });
});
