import { z } from "astro/zod";
import type { Locale } from "@i18n/config";
import { isValidLocale } from "@i18n/utils";

export const serviceStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED", "DELETED"]);
export const serviceOrganizationIdSchema = z.string().trim().min(1).optional().nullable();
const localeSchema = z.string().refine((value): value is Locale => isValidLocale(value), "Unsupported locale");
const slugSchema = z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain only lowercase letters, numbers, and hyphens.");
const nullableText = (max: number) => z.string().trim().max(max).optional().nullable();
const queryBooleanSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return value;
}, z.boolean().optional());

const serviceEditableFields = {
  organizationId: serviceOrganizationIdSchema,
  locale: localeSchema,
  title: z.string().trim().min(1).max(180),
  slug: slugSchema,
  excerpt: nullableText(500),
  content: z.string().min(1),
  coverImageId: z.string().uuid().optional().nullable(),
  ogImageId: z.string().uuid().optional().nullable(),
  priceMinor: z.coerce.number().int().min(0).max(2_147_483_647).optional().nullable(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional().nullable(),
  durationMinutes: z.coerce.number().int().positive().max(100_000).optional().nullable(),
  maxParticipants: z.coerce.number().int().positive().max(1_000_000).optional().nullable(),
  isMobile: z.boolean(),
  isFeatured: z.boolean(),
  categoryIds: z.array(z.string().uuid()).max(100),
  tagIds: z.array(z.string().uuid()).max(100),
  metaTitle: nullableText(180),
  metaDescription: nullableText(320),
  metaKeywords: nullableText(500),
  canonicalUrl: z.string().url().optional().nullable(),
  ogTitle: nullableText(180),
  ogDescription: nullableText(320),
  locationLabel: nullableText(180),
  locationAddress: nullableText(500),
  focusKeyword: nullableText(120),
};

/** Creation always starts as draft; these literal fields exist only for backwards-compatible UI payloads. */
export const serviceFormSchema = z.object({
  ...serviceEditableFields,
  isMobile: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  categoryIds: z.array(z.string().uuid()).max(100).default([]),
  tagIds: z.array(z.string().uuid()).max(100).default([]),
  status: z.literal("DRAFT").default("DRAFT"),
  publishedAt: z.null().default(null),
});

/** Update payload never carries lifecycle state. State changes are explicit actions. */
export const serviceUpdateSchema = z.object({
  organizationId: serviceOrganizationIdSchema,
  locale: localeSchema.optional(),
  title: z.string().trim().min(1).max(180).optional(),
  slug: slugSchema.optional(),
  excerpt: nullableText(500),
  content: z.string().min(1).optional(),
  coverImageId: z.string().uuid().optional().nullable(),
  ogImageId: z.string().uuid().optional().nullable(),
  priceMinor: z.coerce.number().int().min(0).max(2_147_483_647).optional().nullable(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional().nullable(),
  durationMinutes: z.coerce.number().int().positive().max(100_000).optional().nullable(),
  maxParticipants: z.coerce.number().int().positive().max(1_000_000).optional().nullable(),
  isMobile: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  categoryIds: z.array(z.string().uuid()).max(100).optional(),
  tagIds: z.array(z.string().uuid()).max(100).optional(),
  metaTitle: nullableText(180),
  metaDescription: nullableText(320),
  metaKeywords: nullableText(500),
  canonicalUrl: z.string().url().optional().nullable(),
  ogTitle: nullableText(180),
  ogDescription: nullableText(320),
  locationLabel: nullableText(180),
  locationAddress: nullableText(500),
  focusKeyword: nullableText(120),
  id: z.string().uuid(),
}).strict();

export type ServiceCreateInput = z.infer<typeof serviceFormSchema>;
export type ServiceUpdateInput = z.infer<typeof serviceUpdateSchema>;

export const serviceReportSchema = z.object({
  serviceId: z.string().uuid(), organizationId: serviceOrganizationIdSchema,
  commentId: z.string().uuid().optional(), reviewId: z.string().uuid().optional(),
  reason: z.enum(["SPAM", "ABUSIVE", "OFF_TOPIC", "HATE_SPEECH", "OTHER"]), description: nullableText(2000),
}).refine((value) => Number(Boolean(value.commentId)) + Number(Boolean(value.reviewId)) === 1, { path: ["commentId"], message: "A report must target exactly one comment or review." });

export const serviceAdminFiltersSchema = z.object({
  organizationId: serviceOrganizationIdSchema, page: z.coerce.number().int().positive().max(10_000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), search: z.string().trim().max(120).optional(), status: serviceStatusSchema.optional(), categoryId: z.string().uuid().optional(), tagId: z.string().uuid().optional(), authorId: z.string().trim().min(1).max(200).optional(), providerId: z.string().trim().min(1).max(200).optional(), featured: queryBooleanSchema, mobile: queryBooleanSchema, locale: localeSchema.optional(), sortBy: z.enum(["createdAt", "updatedAt", "publishedAt", "title", "priceMinor", "ratingAverage100", "viewCount"]).default("updatedAt"), sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type ServiceAdminFilters = z.input<typeof serviceAdminFiltersSchema>;

export const serviceListFiltersSchema = z.object({
  organizationId: serviceOrganizationIdSchema, page: z.coerce.number().int().positive().max(10_000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), search: z.string().trim().max(120).optional(), status: serviceStatusSchema.optional(), categoryId: z.string().uuid().optional(), tagId: z.string().uuid().optional(), providerId: z.string().trim().min(1).max(200).optional(), featured: queryBooleanSchema, mobile: queryBooleanSchema, locale: localeSchema.optional(), sortBy: z.enum(["createdAt", "updatedAt", "publishedAt", "title", "priceMinor", "ratingAverage100", "viewCount"]).default("updatedAt"), sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type ServiceListFilters = z.input<typeof serviceListFiltersSchema>;

export const serviceAvailabilitySchema = z.object({
  serviceId: z.string().uuid(), dayOfWeek: z.coerce.number().int().min(0).max(6), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timezone: z.string().trim().min(1).max(64), maxParticipants: z.coerce.number().int().positive().max(1_000_000).optional().nullable(),
}).refine((value) => value.startTime < value.endTime, { path: ["endTime"], message: "End time must be after start time." });

export function calculateServiceSeoScore(input: { title?: string; metaTitle?: string; metaDescription?: string; focusKeyword?: string }): number {
  let score = 0;
  if (input.title?.trim()) score += 25; if (input.metaTitle?.trim()) score += 20; if (input.metaDescription?.trim()) score += 20; if (input.focusKeyword?.trim()) score += 15; if ((input.title?.length ?? 0) >= 25) score += 10; if ((input.metaDescription?.length ?? 0) >= 80) score += 10;
  return Math.min(100, score);
}
