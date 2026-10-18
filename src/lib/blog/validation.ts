import { z } from "astro/zod";
import { LOCALES } from "@i18n/config";
import {
  BLOG_POST_STATUSES, BLOG_COMMENT_STATUSES, BLOG_REVIEW_STATUSES, BLOG_REPORT_REASONS,
  BLOG_REPORT_STATUSES, BLOG_REACTION_TYPES, BLOG_LINK_TYPES, BLOG_RESERVED_SLUGS, BLOG_SEO_LIMITS,
} from "./constants";

const localeEnum = z.enum(LOCALES);
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertSlugNotReserved(slug: string, message = `Le slug « ${slug} » est réservé.`) {
  if (BLOG_RESERVED_SLUGS.has(slug)) throw new Error(message);
}

export const blogSlugSchema = z.string().trim().min(1, "Le slug est requis.").max(200, "Le slug ne peut pas dépasser 200 caractères.").regex(slugRegex, "Le slug ne peut contenir que des lettres minuscules, chiffres et tirets.").refine((s) => !BLOG_RESERVED_SLUGS.has(s), { message: "Ce slug est réservé et ne peut pas être utilisé." });
export const blogPostStatusSchema = z.enum(BLOG_POST_STATUSES);
export const blogCommentStatusSchema = z.enum(BLOG_COMMENT_STATUSES);
export const blogReviewStatusSchema = z.enum(BLOG_REVIEW_STATUSES);
export const blogReportReasonSchema = z.enum(BLOG_REPORT_REASONS);
export const blogReportStatusSchema = z.enum(BLOG_REPORT_STATUSES);
export const blogReactionTypeSchema = z.enum(BLOG_REACTION_TYPES);
export const blogLinkTypeSchema = z.enum(BLOG_LINK_TYPES);

export const blogSeoInputSchema = z.object({
  focusKeyword: z.string().trim().max(100).optional(),
  metaRobots: z.enum(["index,follow", "noindex,follow", "index,nofollow", "noindex,nofollow"]).optional(),
  metaOgType: z.enum(["article", "website", "blog"]).optional(),
  metaTwitterCard: z.enum(["summary", "summary_large_image"]).optional(),
  schemaMarkup: z.record(z.string(), z.unknown()).optional(),
});

export const blogPostFormSchema = z.object({
  locale: localeEnum,
  title: z.string().trim().min(1, "Le titre est requis.").max(200, "Le titre ne peut pas dépasser 200 caractères."),
  slug: blogSlugSchema,
  content: z.string().min(1, "Le contenu est requis."),
  excerpt: z.string().trim().max(500).optional(),
  metaTitle: z.string().trim().max(70).optional(),
  metaDescription: z.string().trim().max(160).optional(),
  metaKeywords: z.string().trim().max(300).optional(),
  canonicalUrl: z.url().max(500).optional(),
  ogTitle: z.string().trim().max(70).optional(),
  ogDescription: z.string().trim().max(200).optional(),
  status: blogPostStatusSchema,
  categoryIds: z.array(z.uuid()).max(10).optional(),
  tagIds: z.array(z.uuid()).max(20).optional(),
  featuredImageId: z.uuid().optional(),
  ogImageId: z.uuid().optional(),
  isFeatured: z.boolean().optional(),
  isSticky: z.boolean().optional(),
  commentStatus: z.enum(["OPEN", "CLOSED", "DISABLED"]).optional(),
  allowReviews: z.boolean().optional(),
  publishedAt: z.coerce.date().optional(),
  seo: blogSeoInputSchema.optional(),
});

// Status and publication date stay in the inferred Action input so legacy
// implementation code remains type-safe, but the schema rejects them for the
// ordinary update path. Lifecycle mutations are explicit Actions.
export const blogPostUpdateSchema = blogPostFormSchema.partial().extend({ id: z.uuid(), locale: localeEnum.optional() }).superRefine((data, ctx) => {
  if (data.status !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "Le statut doit être modifié via une action de lifecycle explicite." });
  if (data.publishedAt !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["publishedAt"], message: "La date de publication doit être modifiée via une action de lifecycle explicite." });
});

export const blogCategoryFormSchema = z.object({ locale: localeEnum, name: z.string().trim().min(1).max(100), slug: blogSlugSchema, description: z.string().trim().max(500).optional(), parentId: z.uuid().optional(), icon: z.string().trim().max(50).optional(), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(), sortOrder: z.number().int().min(0).optional(), metaTitle: z.string().trim().max(70).optional(), metaDescription: z.string().trim().max(160).optional() });
export const blogCategoryUpdateSchema = blogCategoryFormSchema.partial().extend({ id: z.uuid() });
export const blogTagFormSchema = z.object({ locale: localeEnum, name: z.string().trim().min(1).max(50), slug: blogSlugSchema, color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional() });
export const blogTagUpdateSchema = blogTagFormSchema.partial().extend({ id: z.uuid() });
export const blogCommentFormSchema = z.object({ postId: z.uuid(), parentId: z.uuid().optional(), content: z.string().trim().min(1, "Le commentaire est requis.").max(5000), guestName: z.string().trim().min(1).max(100).optional(), guestEmail: z.email().max(200).optional() });
export const blogCommentModerationSchema = z.object({ commentId: z.uuid(), moderationAction: z.enum(["APPROVE", "REJECT", "DELETE", "RESTORE", "EDIT"]), reason: z.string().trim().max(500).optional(), content: z.string().trim().max(5000).optional() });
export const blogReviewFormSchema = z.object({ postId: z.uuid(), rating: z.number().int().min(1).max(5), title: z.string().trim().max(100).optional(), content: z.string().trim().min(1).max(3000), isRecommended: z.boolean().optional() });
export const blogReviewModerationSchema = z.object({ reviewId: z.uuid(), status: blogReviewStatusSchema, reason: z.string().trim().max(500).optional() });
export const blogReportFormSchema = z.object({ postId: z.uuid().optional(), commentId: z.uuid().optional(), reviewId: z.uuid().optional(), reason: blogReportReasonSchema, description: z.string().trim().max(1000).optional() }).refine((data) => [data.postId, data.commentId, data.reviewId].filter(Boolean).length === 1, "Un seul élément peut être signalé à la fois.");
export const blogReactionFormSchema = z.object({ postId: z.uuid(), reactionType: blogReactionTypeSchema });
export const blogPostFiltersSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(9), categorySlug: z.string().trim().max(200).optional(), tagSlug: z.string().trim().max(200).optional(), authorId: z.uuid().optional(), status: blogPostStatusSchema.optional(), searchQuery: z.string().trim().max(200).optional(), sortBy: z.enum(["publishedAt", "viewCount", "title", "createdAt"]).default("publishedAt"), sortOrder: z.enum(["asc", "desc"]).default("desc"), featuredOnly: z.coerce.boolean().default(false) });
export const blogLinkFormSchema = z.object({ sourcePostId: z.uuid(), targetPostId: z.uuid(), linkType: blogLinkTypeSchema, sortOrder: z.number().int().min(0).default(0) });
export const blogLinkUpdateSchema = z.object({ id: z.uuid(), linkType: blogLinkTypeSchema.optional(), sortOrder: z.number().int().min(0).optional() });
export const userProfileSchema = z.object({ bio: z.string().trim().max(500).optional(), website: z.url().trim().max(500).optional().or(z.literal("")), twitter: z.string().trim().max(100).optional(), linkedin: z.string().trim().max(200).optional() });

export function calculateSeoScore(input: { title: string; metaTitle?: string; metaDescription?: string; content: string; focusKeyword?: string }): number {
  let score = 0;
  const mt = input.metaTitle || input.title;
  if (mt.length >= BLOG_SEO_LIMITS.titleMin && mt.length <= BLOG_SEO_LIMITS.titleMax) score += 25; else if (mt.length > 0) score += 10;
  if (input.metaDescription && input.metaDescription.length >= BLOG_SEO_LIMITS.descriptionMin && input.metaDescription.length <= BLOG_SEO_LIMITS.descriptionMax) score += 25;
  if (input.content.length >= BLOG_SEO_LIMITS.contentMin) score += 25; else score += Math.round((input.content.length / BLOG_SEO_LIMITS.contentMin) * 25);
  if (input.focusKeyword) {
    const kw = input.focusKeyword.toLowerCase();
    const content = input.content.toLowerCase();
    const count = content.split(kw).length - 1;
    if (count >= 1 && count <= BLOG_SEO_LIMITS.focusKeywordMax) score += 15; else if (count > 0) score += 5;
    if (mt.toLowerCase().includes(kw)) score += 10;
  }
  return Math.min(100, Math.max(0, score));
}
