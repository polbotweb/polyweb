import { describe, expect, it } from "vitest";
import {
  buildBlogAuthorUrl,
  buildBlogCategoryUrl,
  buildBlogIndexUrl,
  buildBlogPostUrl,
  buildBlogTagUrl,
  buildServiceUrl,
  buildServicesCategoryUrl,
  buildServicesIndexUrl,
  buildServicesTagUrl,
} from "@/lib/routing/content-routes";

describe("content route contract", () => {
  it("builds global Blog routes", () => {
    expect(buildBlogIndexUrl({ locale: "fr" })).toBe("/fr/blog");
    expect(buildBlogCategoryUrl({ locale: "fr", categorySlug: "news" })).toBe("/fr/blog/news");
    expect(buildBlogPostUrl({ locale: "fr", categorySlug: "news", postSlug: "launch" })).toBe("/fr/blog/news/launch");
    expect(buildBlogTagUrl({ locale: "fr", tagSlug: "astro" })).toBe("/fr/blog/tag/astro");
    expect(buildBlogAuthorUrl({ locale: "fr", username: "ana" })).toBe("/fr/blog/author/ana");
  });

  it("builds direct organization Blog routes", () => {
    expect(buildBlogIndexUrl({ locale: "en", organizationSlug: "acme" })).toBe("/en/acme/blog");
    expect(buildBlogPostUrl({ locale: "en", organizationSlug: "acme", categorySlug: "news", postSlug: "launch" })).toBe("/en/acme/blog/news/launch");
  });

  it("keeps category and direct service routes distinct", () => {
    expect(buildServicesIndexUrl({ locale: "fr" })).toBe("/fr/services");
    expect(buildServicesCategoryUrl({ locale: "fr", categorySlug: "home" })).toBe("/fr/services/category/home");
    expect(buildServiceUrl({ locale: "fr", serviceSlug: "audit" })).toBe("/fr/services/audit");
    expect(buildServiceUrl({ locale: "fr", categorySlug: "home", serviceSlug: "audit" })).toBe("/fr/services/category/home/audit");
    expect(buildServicesTagUrl({ locale: "fr", tagSlug: "urgent" })).toBe("/fr/services/tag/urgent");
  });

  it("builds direct organization Services routes", () => {
    expect(buildServicesIndexUrl({ locale: "es", organizationSlug: "acme" })).toBe("/es/acme/services");
    expect(buildServiceUrl({ locale: "es", organizationSlug: "acme", serviceSlug: "audit" })).toBe("/es/acme/services/audit");
    expect(buildServiceUrl({ locale: "es", organizationSlug: "acme", categorySlug: "home", serviceSlug: "audit" })).toBe("/es/acme/services/category/home/audit");
  });
});
