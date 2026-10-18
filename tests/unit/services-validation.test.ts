import { describe, expect, it } from "vitest";
import { serviceAvailabilitySchema, serviceFormSchema, serviceListFiltersSchema } from "@/modules/services/validation";
import { canTransitionService } from "@/modules/services/workflow";

const valid = {
  organizationId: null,
  locale: "fr",
  title: "Consultation stratégique pour votre activité",
  slug: "consultation-strategique",
  content: "<p>Une prestation complète.</p>",
  categoryIds: [],
  tagIds: [],
};

describe("Services validation", () => {
  it("accepts supported locales and normal service inputs", () => {
    expect(serviceFormSchema.parse(valid).locale).toBe("fr");
  });

  it("rejects unsupported locales", () => {
    expect(() => serviceFormSchema.parse({ ...valid, locale: "de" })).toThrow();
  });

  it("rejects malformed slugs", () => {
    expect(() => serviceFormSchema.parse({ ...valid, slug: "Bad Slug" })).toThrow();
  });

  it("rejects negative prices and invalid ids", () => {
    expect(() => serviceFormSchema.parse({ ...valid, priceMinor: -1 })).toThrow();
    expect(() => serviceFormSchema.parse({ ...valid, coverImageId: "not-a-uuid" })).toThrow();
  });

  it("limits list pagination", () => {
    expect(() => serviceListFiltersSchema.parse({ limit: 101 })).toThrow();
    expect(serviceListFiltersSchema.parse({ limit: 20 }).limit).toBe(20);
  });

  it("rejects availability intervals with inverted times", () => {
    expect(() => serviceAvailabilitySchema.parse({ serviceId: crypto.randomUUID(), dayOfWeek: 1, startTime: "18:00", endTime: "09:00", timezone: "Europe/Paris" })).toThrow();
  });
});

describe("Services workflow", () => {
  it("supports the editorial lifecycle", () => {
    expect(canTransitionService("DRAFT", "PUBLISHED")).toBe(true);
    expect(canTransitionService("PUBLISHED", "DRAFT")).toBe(true);
    expect(canTransitionService("ARCHIVED", "DRAFT")).toBe(true);
    expect(canTransitionService("DELETED", "PUBLISHED")).toBe(false);
  });
});
