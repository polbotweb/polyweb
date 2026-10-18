import { describe, expect, it } from "vitest";
import { serviceFormSchema, serviceUpdateSchema, serviceAvailabilitySchema, serviceReportSchema, calculateServiceSeoScore } from "@/modules/services/validation";

describe("Services validation", () => {
  it("accepts a draft form with supported locale and canonical slug", () => {
    const result = serviceFormSchema.safeParse({
      locale: "fr",
      title: "Plomberie",
      slug: "plomberie",
      content: "<p>Intervention</p>",
      status: "DRAFT",
      priceMinor: 10000,
      currency: "eur",
      durationMinutes: 60,
      maxParticipants: 2,
      categoryIds: [],
      tagIds: [],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("DRAFT");
  });

  it("rejects unsupported locales, invalid slugs and non-draft creation", () => {
    expect(serviceFormSchema.safeParse({ locale: "de", title: "X", slug: "x", content: "x", status: "DRAFT" }).success).toBe(false);
    expect(serviceFormSchema.safeParse({ locale: "fr", title: "X", slug: "Bad Slug", content: "x", status: "DRAFT" }).success).toBe(false);
    expect(serviceFormSchema.safeParse({ locale: "fr", title: "X", slug: "x", content: "x", status: "PUBLISHED" }).success).toBe(false);
  });

  it("does not expose lifecycle fields on update", () => {
    const result = serviceUpdateSchema.safeParse({ id: "00000000-0000-4000-8000-000000000001", status: "PUBLISHED" });
    expect(result.success).toBe(false);
  });

  it("requires a strictly increasing availability interval", () => {
    const valid = serviceAvailabilitySchema.safeParse({ serviceId: "00000000-0000-4000-8000-000000000001", dayOfWeek: 1, startTime: "09:00", endTime: "10:00", timezone: "Europe/Paris" });
    const invalid = serviceAvailabilitySchema.safeParse({ serviceId: "00000000-0000-4000-8000-000000000001", dayOfWeek: 1, startTime: "10:00", endTime: "09:00", timezone: "Europe/Paris" });
    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it("requires exactly one report target", () => {
    const base = { serviceId: "00000000-0000-4000-8000-000000000001", reason: "OTHER" as const };
    expect(serviceReportSchema.safeParse(base).success).toBe(false);
    expect(serviceReportSchema.safeParse({ ...base, commentId: "00000000-0000-4000-8000-000000000002" }).success).toBe(true);
    expect(serviceReportSchema.safeParse({ ...base, reviewId: "00000000-0000-4000-8000-000000000003" }).success).toBe(true);
    expect(serviceReportSchema.safeParse({ ...base, commentId: "00000000-0000-4000-8000-000000000002", reviewId: "00000000-0000-4000-8000-000000000003" }).success).toBe(false);
  });

  it("keeps SEO score deterministic", () => {
    expect(calculateServiceSeoScore({ title: "A title", metaTitle: "Meta", metaDescription: "Description", focusKeyword: "service" })).toBe(80);
    expect(calculateServiceSeoScore({})).toBe(0);
  });
});
