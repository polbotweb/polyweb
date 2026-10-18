import { describe, expect, it } from "vitest";
import { servicesModule } from "@/modules/services/module";
import { serviceAdminResource } from "@/modules/services/admin/resource";
import { assertResourceCompatibility } from "@/core/admin/resource-contract";

describe("Services module contracts", () => {
  it("declares every shared CMS capability required by Services", () => {
    expect(servicesModule.capabilities).toMatchObject({
      content: true,
      localization: true,
      media: true,
      seo: true,
      taxonomy: true,
      attributes: true,
      search: true,
      publication: true,
      revisions: true,
      locks: true,
      engagement: true,
      moderation: true,
      notifications: true,
      audit: true,
      cache: true,
    });
  });

  it("declares the shared presentation grammar", () => {
    expect(servicesModule.presentations.card).toEqual(expect.arrayContaining(["default", "compact", "featured", "horizontal"]));
    expect(servicesModule.presentations.list).toEqual(expect.arrayContaining(["default", "dense", "search"]));
    expect(servicesModule.presentations.single).toEqual(expect.arrayContaining(["default", "detail"]));
  });

  it("keeps the admin resource compatible with the module", () => {
    expect(() => assertResourceCompatibility(servicesModule, serviceAdminResource)).not.toThrow();
    expect(serviceAdminResource.management).toMatchObject({ list: true, search: true, filters: true, sort: true, pagination: true, stats: true });
  });
});
