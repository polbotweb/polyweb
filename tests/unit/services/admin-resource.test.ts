import { describe, expect, it } from "vitest";
import { serviceAdminResource } from "@/modules/services/admin/resource";

describe("Services admin resource", () => {
  it("exposes the complete filter surface", () => {
    const ids = serviceAdminResource.list?.filters?.map((filter) => filter.id) ?? [];
    expect(ids).toEqual(expect.arrayContaining(["search", "status", "category", "tag", "provider", "featured", "mobile", "locale"]));
  });

  it("exposes all supported sorts", () => {
    const ids = serviceAdminResource.list?.sorts?.map((sort) => sort.id) ?? [];
    expect(ids).toEqual(expect.arrayContaining(["createdAt", "updatedAt", "publishedAt", "title", "priceMinor", "ratingAverage100", "viewCount"]));
  });

  it("keeps lifecycle actions explicit", () => {
    expect(serviceAdminResource.actions).toMatchObject({ create: true, update: true, duplicate: true, publish: true, unpublish: true, archive: true, restore: true, delete: true });
  });
});
