import type { Locale } from "@i18n/config";
import { assertTransition, canTransition, type WorkflowDefinition } from "@/lib/cms/workflow";

export const BLOG_POST_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED", "DELETED"] as const;
export type BlogPostStatus = (typeof BLOG_POST_STATUSES)[number];

export const BLOG_POST_WORKFLOW: WorkflowDefinition<BlogPostStatus> = {
  states: BLOG_POST_STATUSES,
  transitions: [
    { from: "DRAFT", to: "PUBLISHED" },
    { from: "DRAFT", to: "ARCHIVED" },
    { from: "DRAFT", to: "DELETED" },
    { from: "PUBLISHED", to: "DRAFT" },
    { from: "PUBLISHED", to: "ARCHIVED" },
    { from: "PUBLISHED", to: "DELETED" },
    { from: "ARCHIVED", to: "DRAFT" },
    { from: "ARCHIVED", to: "DELETED" },
    { from: "DELETED", to: "DRAFT" },
  ],
};

type TransitionMap<S extends string> = { [K in S]: readonly S[] };
function buildTransitionMap<S extends string>(states: readonly S[], transitions: readonly { from: S; to: S }[]): TransitionMap<S> {
  const map = {} as TransitionMap<S>;
  for (const state of states) map[state] = transitions.filter((transition) => transition.from === state).map((transition) => transition.to);
  return map;
}

export const BLOG_POST_TRANSITIONS = Object.freeze(buildTransitionMap(BLOG_POST_STATUSES, BLOG_POST_WORKFLOW.transitions));

export function canTransitionBlogPost(from: BlogPostStatus, to: BlogPostStatus): boolean {
  return canTransition(BLOG_POST_WORKFLOW, from, to);
}

export function assertValidBlogPostTransition(from: BlogPostStatus, to: BlogPostStatus): void {
  if (!canTransitionBlogPost(from, to)) {
    throw new Error(`Invalid blog post status transition: ${from} → ${to}.`);
  }
}

export const BLOG_COMMENT_STATUSES = ["PENDING", "APPROVED", "REJECTED", "SPAM", "TRASH"] as const;
export type BlogCommentStatus = (typeof BLOG_COMMENT_STATUSES)[number];

export const BLOG_REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED", "SPAM"] as const;
export type BlogReviewStatus = (typeof BLOG_REVIEW_STATUSES)[number];

export const BLOG_REPORT_REASONS = ["SPAM", "ABUSIVE", "OFF_TOPIC", "HATE_SPEECH", "OTHER"] as const;
export type BlogReportReason = (typeof BLOG_REPORT_REASONS)[number];

export const BLOG_REPORT_STATUSES = ["PENDING", "REVIEWED", "RESOLVED", "REJECTED"] as const;
export type BlogReportStatus = (typeof BLOG_REPORT_STATUSES)[number];

export const BLOG_REACTION_TYPES = ["LIKE", "LOVE", "FIRE", "CLAP", "LAUGH", "SAD"] as const;
export type BlogReactionType = (typeof BLOG_REACTION_TYPES)[number];

export const BLOG_LINK_TYPES = ["RELATED", "PREVIOUS", "NEXT", "REFERENCE"] as const;
export type BlogLinkType = (typeof BLOG_LINK_TYPES)[number];

export const BLOG_OG_LOCALES = {
  fr: "fr_FR",
  en: "en_US",
  ar: "ar_SA",
  es: "es_ES",
} as const satisfies Record<Locale, string>;

export type BlogOgLocale = (typeof BLOG_OG_LOCALES)[Locale];

export const BLOG_DEFAULTS = {
  postsPerPage: 9,
  commentsPerPage: 20,
  reviewsPerPage: 10,
  excerptLength: 160,
  lockDurationMinutes: 15,
  maxFeaturedPosts: 5,
  maxStickyPosts: 3,
} as const;

export const BLOG_RESERVED_SLUGS = new Set([
  "admin", "api", "auth", "rss", "sitemap", "search", "category", "categories",
  "tag", "tags", "author", "authors", "page", "pages", "new", "edit", "preview",
  "index", "create", "delete", "moderate", "stats",
]);

export const BLOG_SEO_LIMITS = {
  titleMin: 30,
  titleMax: 60,
  descriptionMin: 50,
  descriptionMax: 160,
  contentMin: 300,
  focusKeywordMax: 5,
} as const;
