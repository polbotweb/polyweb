import { describe, expect, it } from "vitest";
import { buildServiceCategoryUrl, buildServiceUrl } from "@/modules/services/utils/urls";

describe("Services URLs", () => {
  it("builds global category and categorized service URLs", () => {
    expect(buildServiceUrl("fr", null, "plomberie", "maison")).toBe("/fr/services/category/maison/plomberie");
    expect(buildServiceCategoryUrl("ar", null, "maison")).toBe("/ar/services/category/maison");
  });

  it("builds direct service URLs without a category", () => {
    expect(buildServiceUrl("fr", null, "consulting")).toBe("/fr/services/consulting");
  });

  it("builds organization-scoped URLs with organization slug", () => {
    expect(buildServiceUrl("en", "acme", "plumbing", "home")).toBe("/en/acme/services/category/home/plumbing");
    expect(buildServiceUrl("en", "acme", "plumbing")).toBe("/en/acme/services/plumbing");
    expect(buildServiceCategoryUrl("es", "acme", "home")).toBe("/es/acme/services/category/home");
  });
});
