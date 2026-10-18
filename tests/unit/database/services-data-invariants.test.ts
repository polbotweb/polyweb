import { describe, expect, it } from "vitest";
import { seedManifest } from "@database/data/manifest";

type Row = Record<string, unknown>;
const serviceEntries = seedManifest.filter((entry) => /^([2-4]\d)/.test(entry.dataFile));

async function dataset(schemaExport: string): Promise<Row[]> {
  const entry = serviceEntries.find((item) => item.schemaExport === schemaExport);
  expect(entry, `Missing manifest entry for ${schemaExport}`).toBeDefined();
  const module = await import(`@database/data/${entry!.dataFile}`);
  return module.default as Row[];
}

describe("Services seed invariants", () => {
  it("preserves tenant ownership across Services relationships", async () => {
    const services = await dataset("services");
    const translations = await dataset("serviceTranslations");
    const categories = await dataset("serviceCategories");
    const categoryTranslations = await dataset("serviceCategoryTranslations");
    const tags = await dataset("serviceTags");
    const tagTranslations = await dataset("serviceTagTranslations");
    const categoryLinks = await dataset("serviceCategoryLinks");
    const tagLinks = await dataset("serviceTagLinks");
    const serviceById = new Map(services.map((row) => [row.id, row]));
    const categoryById = new Map(categories.map((row) => [row.id, row]));
    const tagById = new Map(tags.map((row) => [row.id, row]));

    for (const row of translations) {
      const service = serviceById.get(row.serviceId);
      expect(service, `unknown service ${String(row.serviceId)}`).toBeDefined();
      expect(row.organizationId).toBe(service?.organizationId);
      expect(row.locale).toMatch(/^(fr|en|es|ar)$/);
      expect(row.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
    for (const row of categoryTranslations) {
      const category = categoryById.get(row.categoryId);
      expect(category, `unknown category ${String(row.categoryId)}`).toBeDefined();
      expect(row.organizationId).toBe(category?.organizationId);
      expect(row.locale).toMatch(/^(fr|en|es|ar)$/);
      expect(row.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
    for (const row of tagTranslations) {
      const tag = tagById.get(row.tagId);
      expect(tag, `unknown tag ${String(row.tagId)}`).toBeDefined();
      expect(row.organizationId).toBe(tag?.organizationId);
      expect(row.locale).toMatch(/^(fr|en|es|ar)$/);
      expect(row.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
    for (const row of categoryLinks) {
      const service = serviceById.get(row.serviceId);
      const category = categoryById.get(row.categoryId);
      expect(service).toBeDefined();
      expect(category).toBeDefined();
      expect(service?.organizationId).toBe(category?.organizationId);
    }
    for (const row of tagLinks) {
      const service = serviceById.get(row.serviceId);
      const tag = tagById.get(row.tagId);
      expect(service).toBeDefined();
      expect(tag).toBeDefined();
      expect(service?.organizationId).toBe(tag?.organizationId);
    }
  });

  it("enforces one translation per service and locale", async () => {
    const translations = await dataset("serviceTranslations");
    const keys = translations.map((row) => `${String(row.serviceId)}:${String(row.locale)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps lifecycle fixtures internally consistent", async () => {
    const services = await dataset("services");
    for (const row of services) {
      if (row.status === "PUBLISHED") expect(row.publishedAt).toBeInstanceOf(Date);
      if (row.status !== "PUBLISHED") expect(row.publishedAt).toBeNull();
      expect(Number(row.priceMinor ?? 0)).toBeGreaterThanOrEqual(0);
      expect(Number(row.durationMinutes ?? 1)).toBeGreaterThan(0);
      expect(Number(row.maxParticipants ?? 1)).toBeGreaterThan(0);
      expect(Number(row.ratingAverage100 ?? 0)).toBeGreaterThanOrEqual(0);
      expect(Number(row.ratingAverage100 ?? 0)).toBeLessThanOrEqual(500);
    }
  });

  it("enforces single-target reports and notification target semantics", async () => {
    const reports = await dataset("serviceReports");
    for (const row of reports) {
      expect([row.serviceId, row.commentId, row.reviewId].filter((value) => value != null)).toHaveLength(1);
    }

    const notifications = await dataset("serviceNotifications");
    const commentTypes = new Set(["NEW_COMMENT", "REPLY_TO_COMMENT"]);
    const reviewTypes = new Set(["NEW_REVIEW", "REVIEW_APPROVED", "REVIEW_REJECTED"]);
    for (const row of notifications) {
      if (commentTypes.has(String(row.type))) {
        expect(row.commentId).not.toBeNull();
        expect(row.reviewId).toBeNull();
      } else if (reviewTypes.has(String(row.type))) {
        expect(row.reviewId).not.toBeNull();
        expect(row.commentId).toBeNull();
      } else {
        expect(row.commentId).toBeNull();
        expect(row.reviewId).toBeNull();
      }
    }
  });

  it("uses one reaction per user and service", async () => {
    const reactions = await dataset("serviceReactions");
    const keys = reactions.map((row) => `${String(row.serviceId)}:${String(row.userId)}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const row of reactions) expect(["LIKE", "LOVE", "FIRE", "CLAP"]).toContain(row.reactionType);
  });
});
