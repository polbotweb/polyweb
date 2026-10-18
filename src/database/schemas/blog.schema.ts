import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  uniqueIndex,
  index,
  check,
  jsonb,
  primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { user, organization } from "./auth.schema";
import { mediaFiles } from "./media.schema";
import { LOCALES } from "@i18n/config";

const localeEnum = text("locale", { enum: LOCALES }).notNull();

// ─── Blog Posts ─────────────────────────────────────────────────────────────
// One row per post. Translations + SEO + content live in child tables.
// organizationId scopes the post to an org; NULL means global admin blog.
export const blogPosts = pgTable(
  "blog_posts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    status: text("status", { enum: ["DRAFT", "PUBLISHED", "ARCHIVED", "DELETED"] }).default("DRAFT").notNull(),
    featuredImageId: text("featured_image_id").references(() => mediaFiles.id, { onDelete: "set null" }),
    viewCount: integer("view_count").default(0).notNull(),
    isFeatured: boolean("is_featured").default(false).notNull(),
    isSticky: boolean("is_sticky").default(false).notNull(),
    commentStatus: text("comment_status", { enum: ["OPEN", "CLOSED", "DISABLED"] }).default("OPEN").notNull(),
    allowReviews: boolean("allow_reviews").default(true).notNull(),
    seoScore: integer("seo_score"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    lockedBy: text("locked_by").references(() => user.id, { onDelete: "set null" }),
    lockedAt: timestamp("locked_at"),
  },
  (table) => [
    uniqueIndex("blog_posts_org_slug_uidx").on(table.organizationId, table.slug),
    index("blog_posts_org_idx").on(table.organizationId),
    index("blog_posts_author_idx").on(table.authorId),
    index("blog_posts_status_idx").on(table.status),
    index("blog_posts_published_at_idx").on(table.publishedAt),
    index("blog_posts_featured_idx").on(table.organizationId, table.isFeatured, table.status),
    index("blog_posts_sticky_idx").on(table.organizationId, table.isSticky, table.status),
    check("blog_posts_publish_consistency", sql`NOT ${table.status} = 'PUBLISHED' OR ${table.publishedAt} IS NOT NULL`),
  ],
);

// ─── Post Translations ──────────────────────────────────────────────────────
export const blogPostTranslations = pgTable(
  "blog_post_translations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    postId: text("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    locale: localeEnum,
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    content: text("content").notNull(),
    excerpt: text("excerpt"),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    metaKeywords: text("meta_keywords"),
    canonicalUrl: text("canonical_url"),
    ogTitle: text("og_title"),
    ogDescription: text("og_description"),
    ogImageId: text("og_image_id").references(() => mediaFiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    uniqueIndex("blog_post_translations_post_locale_uidx").on(table.postId, table.locale),
    uniqueIndex("blog_post_translations_org_locale_slug_uidx").on(table.organizationId, table.locale, table.slug).where(sql`${table.organizationId} IS NOT NULL`),
    uniqueIndex("blog_post_translations_global_locale_slug_uidx").on(table.locale, table.slug).where(sql`${table.organizationId} IS NULL`),
    index("blog_post_translations_locale_slug_idx").on(table.locale, table.slug),
  ],
);

// ─── Categories ─────────────────────────────────────────────────────────────
export const blogCategories = pgTable(
  "blog_categories",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnyPgColumn => blogCategories.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    icon: text("icon"),
    color: text("color"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    uniqueIndex("blog_categories_org_slug_uidx").on(table.organizationId, table.slug),
    index("blog_categories_org_idx").on(table.organizationId),
    index("blog_categories_parent_idx").on(table.parentId),
    check("blog_categories_no_self_parent", sql`${table.parentId} IS NULL OR ${table.parentId} != ${table.id}`),
  ],
);

export const blogCategoryTranslations = pgTable(
  "blog_category_translations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    categoryId: text("category_id").notNull().references(() => blogCategories.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    locale: localeEnum,
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    uniqueIndex("blog_category_translations_category_locale_uidx").on(table.categoryId, table.locale),
    uniqueIndex("blog_category_translations_org_locale_slug_uidx").on(table.organizationId, table.locale, table.slug).where(sql`${table.organizationId} IS NOT NULL`),
    uniqueIndex("blog_category_translations_global_locale_slug_uidx").on(table.locale, table.slug).where(sql`${table.organizationId} IS NULL`),
    index("blog_category_translations_locale_slug_idx").on(table.locale, table.slug),
  ],
);

// ─── Tags ───────────────────────────────────────────────────────────────────
export const blogTags = pgTable(
  "blog_tags",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    color: text("color"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    uniqueIndex("blog_tags_org_slug_uidx").on(table.organizationId, table.slug),
    index("blog_tags_org_idx").on(table.organizationId),
  ],
);

export const blogTagTranslations = pgTable(
  "blog_tag_translations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tagId: text("tag_id").notNull().references(() => blogTags.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    locale: localeEnum,
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    uniqueIndex("blog_tag_translations_tag_locale_uidx").on(table.tagId, table.locale),
    uniqueIndex("blog_tag_translations_org_locale_slug_uidx").on(table.organizationId, table.locale, table.slug).where(sql`${table.organizationId} IS NOT NULL`),
    uniqueIndex("blog_tag_translations_global_locale_slug_uidx").on(table.locale, table.slug).where(sql`${table.organizationId} IS NULL`),
    index("blog_tag_translations_locale_slug_idx").on(table.locale, table.slug),
  ],
);

// ─── Post ↔ Category / Tag junctions ────────────────────────────────────────
export const blogPostCategories = pgTable(
  "blog_post_categories",
  {
    postId: text("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
    categoryId: text("category_id").notNull().references(() => blogCategories.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.postId, table.categoryId] })],
);

export const blogPostTags = pgTable(
  "blog_post_tags",
  {
    postId: text("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull().references(() => blogTags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.postId, table.tagId] })],
);

// ─── Comments ───────────────────────────────────────────────────────────────
export const blogComments = pgTable(
  "blog_comments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    postId: text("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    parentId: text("parent_id").references((): AnyPgColumn => blogComments.id, { onDelete: "cascade" }),
    guestName: text("guest_name"),
    guestEmail: text("guest_email"),
    content: text("content").notNull(),
    status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED", "SPAM", "TRASH"] }).default("PENDING").notNull(),
    karma: integer("karma").default(0).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    isEdited: boolean("is_edited").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index("blog_comments_post_idx").on(table.postId),
    index("blog_comments_parent_idx").on(table.parentId),
    index("blog_comments_status_idx").on(table.status),
    index("blog_comments_author_idx").on(table.authorId),
    index("blog_comments_created_idx").on(table.createdAt),
  ],
);

export const blogCommentModerations = pgTable(
  "blog_comment_moderations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    commentId: text("comment_id").notNull().references(() => blogComments.id, { onDelete: "cascade" }),
    moderatorId: text("moderator_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    action: text("action", { enum: ["APPROVE", "REJECT", "DELETE", "RESTORE", "EDIT"] }).notNull(),
    reason: text("reason"),
    previousValues: jsonb("previous_values"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("blog_comment_moderations_comment_idx").on(table.commentId),
    index("blog_comment_moderations_moderator_idx").on(table.moderatorId),
  ],
);

// ─── Revisions ──────────────────────────────────────────────────────────────
export const blogPostRevisions = pgTable(
  "blog_post_revisions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    postId: text("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    locale: localeEnum,
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    content: text("content").notNull(),
    excerpt: text("excerpt"),
    status: text("status", { enum: ["DRAFT", "PUBLISHED", "ARCHIVED"] }).notNull(),
    revisionNote: text("revision_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("blog_post_revisions_post_idx").on(table.postId),
    index("blog_post_revisions_author_idx").on(table.authorId),
  ],
);

// ─── Galleries ──────────────────────────────────────────────────────────────
export const blogPostGalleries = pgTable(
  "blog_post_galleries",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    postId: text("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
    title: text("title"),
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [index("blog_post_galleries_post_idx").on(table.postId)],
);

export const blogPostGalleryMedia = pgTable(
  "blog_post_gallery_media",
  {
    galleryId: text("gallery_id").notNull().references(() => blogPostGalleries.id, { onDelete: "cascade" }),
    mediaId: text("media_id").notNull().references(() => mediaFiles.id, { onDelete: "cascade" }),
    altText: text("alt_text").notNull(),
    caption: text("caption"),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [primaryKey({ columns: [table.galleryId, table.mediaId] })],
);

// ─── Reviews / Ratings ──────────────────────────────────────────────────────
export const blogPostReviews = pgTable(
  "blog_post_reviews",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    postId: text("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    rating: integer("rating").notNull(),
    title: text("title"),
    content: text("content").notNull(),
    status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED", "SPAM"] }).default("PENDING").notNull(),
    isRecommended: boolean("is_recommended").default(true).notNull(),
    helpfulCount: integer("helpful_count").default(0).notNull(),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index("blog_post_reviews_post_idx").on(table.postId),
    index("blog_post_reviews_author_idx").on(table.authorId),
    index("blog_post_reviews_rating_idx").on(table.rating),
    index("blog_post_reviews_status_idx").on(table.status),
    check("blog_post_reviews_rating_check", sql`${table.rating} BETWEEN 1 AND 5`),
  ],
);

export const blogPostReviewHelpful = pgTable(
  "blog_post_review_helpful",
  {
    reviewId: text("review_id").notNull().references(() => blogPostReviews.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    isHelpful: boolean("is_helpful").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.reviewId, table.userId] })],
);

// ─── Reports ─────────────────────────────────────────────────────────────────
export const blogReports = pgTable(
  "blog_reports",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    postId: text("post_id").references(() => blogPosts.id, { onDelete: "cascade" }),
    commentId: text("comment_id").references(() => blogComments.id, { onDelete: "cascade" }),
    reviewId: text("review_id").references(() => blogPostReviews.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id").references(() => user.id, { onDelete: "set null" }),
    reason: text("reason", { enum: ["SPAM", "ABUSIVE", "OFF_TOPIC", "HATE_SPEECH", "OTHER"] }).notNull(),
    description: text("description"),
    status: text("status", { enum: ["PENDING", "REVIEWED", "RESOLVED", "REJECTED"] }).default("PENDING").notNull(),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("blog_reports_status_idx").on(table.status),
    index("blog_reports_reporter_idx").on(table.reporterId),
    check("blog_reports_single_target", sql`(((${table.postId} IS NOT NULL)::int + (${table.commentId} IS NOT NULL)::int + (${table.reviewId} IS NOT NULL)::int) = 1)`),
  ],
);

// ─── Favorites & Reactions ──────────────────────────────────────────────────
export const blogPostFavorites = pgTable(
  "blog_post_favorites",
  {
    postId: text("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userId] })],
);

export const blogPostReactions = pgTable(
  "blog_post_reactions",
  {
    postId: text("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    reactionType: text("reaction_type", { enum: ["LIKE", "LOVE", "FIRE", "CLAP", "LAUGH", "SAD"] }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userId] })],
);

// ─── SEO metadata ───────────────────────────────────────────────────────────
export const blogPostSeo = pgTable(
  "blog_post_seo",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    postId: text("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
    locale: localeEnum,
    focusKeyword: text("focus_keyword"),
    focusKeywordScore: integer("focus_keyword_score"),
    readabilityScore: integer("readability_score"),
    metaRobots: text("meta_robots", { enum: ["index,follow", "noindex,follow", "index,nofollow", "noindex,nofollow"] }).default("index,follow"),
    metaOgType: text("meta_og_type", { enum: ["article", "website", "blog"] }).default("article"),
    metaOgLocale: text("meta_og_locale", { enum: ["fr_FR", "en_US", "ar_SA", "es_ES"] }),
    metaTwitterCard: text("meta_twitter_card", { enum: ["summary", "summary_large_image"] }).default("summary_large_image"),
    schemaMarkup: jsonb("schema_markup"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [uniqueIndex("blog_post_seo_post_locale_uidx").on(table.postId, table.locale)],
);

// ─── View Stats ─────────────────────────────────────────────────────────────
export const blogPostViewStats = pgTable(
  "blog_post_view_stats",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    postId: text("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at").defaultNow().notNull(),
    date: text("date").notNull(),
    hour: integer("hour").notNull(),
    referrer: text("referrer"),
    country: varchar("country", { length: 2 }),
    deviceType: text("device_type", { enum: ["DESKTOP", "MOBILE", "TABLET"] }),
    sessionId: text("session_id"),
  },
  (table) => [
    index("blog_post_view_stats_post_idx").on(table.postId),
    index("blog_post_view_stats_date_idx").on(table.date),
    index("blog_post_view_stats_post_date_idx").on(table.postId, table.date),
    check("blog_post_view_stats_hour_check", sql`${table.hour} BETWEEN 0 AND 23`),
  ],
);

// ─── Notifications ──────────────────────────────────────────────────────────
export const blogNotifications = pgTable(
  "blog_notifications",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["NEW_COMMENT", "COMMENT_APPROVED", "COMMENT_REJECTED", "NEW_REVIEW", "REVIEW_APPROVED", "REVIEW_REJECTED", "POST_PUBLISHED", "POST_MENTION", "REPLY_TO_COMMENT"] }).notNull(),
    postId: text("post_id").references(() => blogPosts.id, { onDelete: "cascade" }),
    commentId: text("comment_id").references(() => blogComments.id, { onDelete: "cascade" }),
    reviewId: text("review_id").references(() => blogPostReviews.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id").references(() => user.id, { onDelete: "set null" }),
    isRead: boolean("is_read").default(false).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("blog_notifications_user_idx").on(table.userId),
    index("blog_notifications_org_user_idx").on(table.organizationId, table.userId),
    index("blog_notifications_read_idx").on(table.isRead),
    index("blog_notifications_type_idx").on(table.type),
    index("blog_notifications_created_idx").on(table.createdAt),
    check("blog_notifications_single_target", sql`(${table.postId} IS NOT NULL AND NOT (${table.commentId} IS NOT NULL AND ${table.reviewId} IS NOT NULL))`),
  ],
);

// ─── Edit Locks ─────────────────────────────────────────────────────────────
export const blogPostLocks = pgTable(
  "blog_post_locks",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    postId: text("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }).unique(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    lockedAt: timestamp("locked_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [index("blog_post_locks_expires_idx").on(table.expiresAt)],
);

// ─── Related / internal links ───────────────────────────────────────────────
export const blogPostLinks = pgTable(
  "blog_post_links",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    sourcePostId: text("source_post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
    targetPostId: text("target_post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
    linkType: text("link_type", { enum: ["RELATED", "PREVIOUS", "NEXT", "REFERENCE"] }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("blog_post_links_unique_idx").on(table.sourcePostId, table.targetPostId, table.linkType),
    index("blog_post_links_source_idx").on(table.sourcePostId),
    index("blog_post_links_target_idx").on(table.targetPostId),
    check("blog_post_links_no_self_check", sql`${table.sourcePostId} <> ${table.targetPostId}`),
  ],
);

// ─── Newsletter subscribers ──────────────────────────────────────────────────
export const blogSubscribers = pgTable(
  "blog_subscribers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    locale: text("locale", { enum: LOCALES }).notNull(),
    token: text("token").unique(),
    tokenUsedAt: timestamp("token_used_at"),
    confirmationTokenHash: text("confirmation_token_hash"),
    confirmationTokenExpiresAt: timestamp("confirmation_token_expires_at"),
    confirmationTokenUsedAt: timestamp("confirmation_token_used_at"),
    unsubscribeTokenHash: text("unsubscribe_token_hash"),
    unsubscribeTokenUsedAt: timestamp("unsubscribe_token_used_at"),
    status: text("status", { enum: ["PENDING", "CONFIRMED", "UNSUBSCRIBED"] }).default("PENDING").notNull(),
    confirmedAt: timestamp("confirmed_at"),
    unsubscribedAt: timestamp("unsubscribed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    uniqueIndex("blog_subscribers_org_email_uidx").on(table.organizationId, table.email),
    index("blog_subscribers_org_idx").on(table.organizationId),
    index("blog_subscribers_status_idx").on(table.status),
    index("blog_subscribers_token_idx").on(table.token),
    uniqueIndex("blog_subscribers_confirmation_token_hash_uidx").on(table.confirmationTokenHash),
    uniqueIndex("blog_subscribers_unsubscribe_token_hash_uidx").on(table.unsubscribeTokenHash),
    index("blog_subscribers_confirmation_expires_idx").on(table.confirmationTokenExpiresAt),
    check("blog_subscribers_token_purpose_check", sql`${table.confirmationTokenHash} IS NULL OR ${table.unsubscribeTokenHash} IS NULL OR ${table.confirmationTokenHash} <> ${table.unsubscribeTokenHash} OR (${table.token} IS NULL AND ${table.tokenUsedAt} IS NOT NULL)`),
  ],
);

// ─── Relations ──────────────────────────────────────────────────────────────
export const blogPostsRelations = relations(blogPosts, ({ one, many }) => ({
  organization: one(organization, { fields: [blogPosts.organizationId], references: [organization.id] }),
  author: one(user, { fields: [blogPosts.authorId], references: [user.id], relationName: "blogPostAuthor" }),
  updatedByUser: one(user, { fields: [blogPosts.updatedBy], references: [user.id], relationName: "blogPostUpdater" }),
  lockedByUser: one(user, { fields: [blogPosts.lockedBy], references: [user.id], relationName: "blogPostLocker" }),
  featuredImage: one(mediaFiles, { fields: [blogPosts.featuredImageId], references: [mediaFiles.id] }),
  translations: many(blogPostTranslations),
  categories: many(blogPostCategories),
  tags: many(blogPostTags),
  comments: many(blogComments),
  revisions: many(blogPostRevisions),
  galleries: many(blogPostGalleries),
  reviews: many(blogPostReviews),
  favorites: many(blogPostFavorites),
  reactions: many(blogPostReactions),
  seo: many(blogPostSeo),
  viewStats: many(blogPostViewStats),
  links: many(blogPostLinks, { relationName: "blogPostSourceLinks" }),
  linkedTo: many(blogPostLinks, { relationName: "blogPostTargetLinks" }),
  locks: one(blogPostLocks, { fields: [blogPosts.id], references: [blogPostLocks.postId] }),
}));

export const blogPostTranslationsRelations = relations(blogPostTranslations, ({ one }) => ({
  post: one(blogPosts, { fields: [blogPostTranslations.postId], references: [blogPosts.id] }),
  ogImage: one(mediaFiles, { fields: [blogPostTranslations.ogImageId], references: [mediaFiles.id] }),
}));

export const blogCategoriesRelations = relations(blogCategories, ({ one, many }) => ({
  organization: one(organization, { fields: [blogCategories.organizationId], references: [organization.id] }),
  parent: one(blogCategories, { fields: [blogCategories.parentId], references: [blogCategories.id], relationName: "blogCategoryParent" }),
  children: many(blogCategories, { relationName: "blogCategoryParent" }),
  translations: many(blogCategoryTranslations),
  posts: many(blogPostCategories),
}));

export const blogCategoryTranslationsRelations = relations(blogCategoryTranslations, ({ one }) => ({
  category: one(blogCategories, { fields: [blogCategoryTranslations.categoryId], references: [blogCategories.id] }),
}));

export const blogTagsRelations = relations(blogTags, ({ one, many }) => ({
  organization: one(organization, { fields: [blogTags.organizationId], references: [organization.id] }),
  translations: many(blogTagTranslations),
  posts: many(blogPostTags),
}));

export const blogTagTranslationsRelations = relations(blogTagTranslations, ({ one }) => ({
  tag: one(blogTags, { fields: [blogTagTranslations.tagId], references: [blogTags.id] }),
}));

export const blogPostCategoriesRelations = relations(blogPostCategories, ({ one }) => ({
  post: one(blogPosts, { fields: [blogPostCategories.postId], references: [blogPosts.id] }),
  category: one(blogCategories, { fields: [blogPostCategories.categoryId], references: [blogCategories.id] }),
}));

export const blogPostTagsRelations = relations(blogPostTags, ({ one }) => ({
  post: one(blogPosts, { fields: [blogPostTags.postId], references: [blogPosts.id] }),
  tag: one(blogTags, { fields: [blogPostTags.tagId], references: [blogTags.id] }),
}));

export const blogCommentsRelations = relations(blogComments, ({ one, many }) => ({
  post: one(blogPosts, { fields: [blogComments.postId], references: [blogPosts.id] }),
  author: one(user, { fields: [blogComments.authorId], references: [user.id] }),
  parent: one(blogComments, { fields: [blogComments.parentId], references: [blogComments.id], relationName: "blogCommentParent" }),
  replies: many(blogComments, { relationName: "blogCommentParent" }),
  moderations: many(blogCommentModerations),
}));

export const blogCommentModerationsRelations = relations(blogCommentModerations, ({ one }) => ({
  comment: one(blogComments, { fields: [blogCommentModerations.commentId], references: [blogComments.id] }),
  moderator: one(user, { fields: [blogCommentModerations.moderatorId], references: [user.id] }),
}));

export const blogPostRevisionsRelations = relations(blogPostRevisions, ({ one }) => ({
  post: one(blogPosts, { fields: [blogPostRevisions.postId], references: [blogPosts.id] }),
  author: one(user, { fields: [blogPostRevisions.authorId], references: [user.id] }),
}));

export const blogPostGalleriesRelations = relations(blogPostGalleries, ({ one, many }) => ({
  post: one(blogPosts, { fields: [blogPostGalleries.postId], references: [blogPosts.id] }),
  media: many(blogPostGalleryMedia),
}));

export const blogPostGalleryMediaRelations = relations(blogPostGalleryMedia, ({ one }) => ({
  gallery: one(blogPostGalleries, { fields: [blogPostGalleryMedia.galleryId], references: [blogPostGalleries.id] }),
  file: one(mediaFiles, { fields: [blogPostGalleryMedia.mediaId], references: [mediaFiles.id] }),
}));

export const blogPostReviewsRelations = relations(blogPostReviews, ({ one, many }) => ({
  post: one(blogPosts, { fields: [blogPostReviews.postId], references: [blogPosts.id] }),
  author: one(user, { fields: [blogPostReviews.authorId], references: [user.id] }),
  helpfulVotes: many(blogPostReviewHelpful),
}));

export const blogPostReviewHelpfulRelations = relations(blogPostReviewHelpful, ({ one }) => ({
  review: one(blogPostReviews, { fields: [blogPostReviewHelpful.reviewId], references: [blogPostReviews.id] }),
  user: one(user, { fields: [blogPostReviewHelpful.userId], references: [user.id] }),
}));

export const blogReportsRelations = relations(blogReports, ({ one }) => ({
  post: one(blogPosts, { fields: [blogReports.postId], references: [blogPosts.id] }),
  comment: one(blogComments, { fields: [blogReports.commentId], references: [blogComments.id] }),
  review: one(blogPostReviews, { fields: [blogReports.reviewId], references: [blogPostReviews.id] }),
  reporter: one(user, { fields: [blogReports.reporterId], references: [user.id] }),
  resolver: one(user, { fields: [blogReports.resolvedBy], references: [user.id] }),
}));

export const blogPostFavoritesRelations = relations(blogPostFavorites, ({ one }) => ({
  post: one(blogPosts, { fields: [blogPostFavorites.postId], references: [blogPosts.id] }),
  user: one(user, { fields: [blogPostFavorites.userId], references: [user.id] }),
}));

export const blogPostReactionsRelations = relations(blogPostReactions, ({ one }) => ({
  post: one(blogPosts, { fields: [blogPostReactions.postId], references: [blogPosts.id] }),
  user: one(user, { fields: [blogPostReactions.userId], references: [user.id] }),
}));

export const blogPostSeoRelations = relations(blogPostSeo, ({ one }) => ({
  post: one(blogPosts, { fields: [blogPostSeo.postId], references: [blogPosts.id] }),
}));

export const blogPostViewStatsRelations = relations(blogPostViewStats, ({ one }) => ({
  post: one(blogPosts, { fields: [blogPostViewStats.postId], references: [blogPosts.id] }),
}));

export const blogNotificationsRelations = relations(blogNotifications, ({ one }) => ({
  user: one(user, { fields: [blogNotifications.userId], references: [user.id] }),
  organization: one(organization, { fields: [blogNotifications.organizationId], references: [organization.id] }),
  post: one(blogPosts, { fields: [blogNotifications.postId], references: [blogPosts.id] }),
  comment: one(blogComments, { fields: [blogNotifications.commentId], references: [blogComments.id] }),
  review: one(blogPostReviews, { fields: [blogNotifications.reviewId], references: [blogPostReviews.id] }),
  fromUser: one(user, { fields: [blogNotifications.fromUserId], references: [user.id] }),
}));

export const blogPostLocksRelations = relations(blogPostLocks, ({ one }) => ({
  post: one(blogPosts, { fields: [blogPostLocks.postId], references: [blogPosts.id] }),
  user: one(user, { fields: [blogPostLocks.userId], references: [user.id] }),
}));

export const blogPostLinksRelations = relations(blogPostLinks, ({ one }) => ({
  sourcePost: one(blogPosts, { fields: [blogPostLinks.sourcePostId], references: [blogPosts.id], relationName: "blogPostSourceLinks" }),
  targetPost: one(blogPosts, { fields: [blogPostLinks.targetPostId], references: [blogPosts.id], relationName: "blogPostTargetLinks" }),
}));
