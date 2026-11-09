/**
 * Tables du domaine forums (migration 0055, docs/forums.md).
 *
 * forums (site) → forum_categories → forum_topics → forum_posts ; étiquettes par site.
 * Statut de modération (`visible` | `hidden` | `spam`) = source de vérité de la visibilité
 * (adaptateurs core/moderation). Recherche plein texte : colonnes `search_vector` générées
 * (configuration `simple`, multilingue) + index GIN. Le corps Markdown source est conservé ;
 * `body_html` est le rendu assaini (core/content/markdown) calculé à l'écriture.
 */
import { sql } from "drizzle-orm";
import { boolean, check, customType, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { organization, user } from "@database/schemas/auth.schema";
import { sites } from "@database/schemas/content.schema";
import { FORUMS_STATUSES } from "../domain/workflow";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const FORUM_VISIBILITIES = ["public", "members", "org"] as const;
export type ForumVisibility = (typeof FORUM_VISIBILITIES)[number];
export const FORUM_CONTENT_STATUSES = ["visible", "hidden", "spam"] as const;
export type ForumContentStatus = (typeof FORUM_CONTENT_STATUSES)[number];
export const FORUM_VOTE_TARGETS = ["topic", "post"] as const;
export type ForumVoteTarget = (typeof FORUM_VOTE_TARGETS)[number];
export const FORUM_REACTIONS = ["like", "thanks", "insightful", "funny", "agree"] as const;
export type ForumReaction = (typeof FORUM_REACTIONS)[number];
export const FORUM_POLL_RESULTS = ["always", "after_vote", "after_close"] as const;
export type ForumPollResults = (typeof FORUM_POLL_RESULTS)[number];
export const FORUM_SANCTION_KINDS = ["mute", "suspension"] as const;
export type ForumSanctionKind = (typeof FORUM_SANCTION_KINDS)[number];

/** Libellés localisés d'une catégorie (admin), par code de langue. */
export type ForumCategoryTranslations = Record<string, { name: string; description?: string }>;

export const forums = pgTable("forums", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
  siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  visibility: varchar("visibility", { length: 16, enum: FORUM_VISIBILITIES }).default("public").notNull(),
  position: integer("position").default(0).notNull(),
  status: text("status", { enum: FORUMS_STATUSES }).default("DRAFT").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("forums_site_slug_uidx").on(table.siteId, table.slug),
  index("forums_org_idx").on(table.organizationId),
  check("forums_visibility_check", sql`${table.visibility} IN ('public', 'members', 'org')`),
]);

/** Révisions (core/revision) : une ligne par écriture, pour l'historique et la restauration. */
export const forumRevisions = pgTable("forum_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().references(() => forums.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: FORUMS_STATUSES }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("forum_revisions_resource_idx").on(table.resourceId)]);

/** Verrous d'édition (core/locks) : une ligne par ressource, propriétaire utilisateur + session. */
export const forumLocks = pgTable("forum_locks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().unique().references(() => forums.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const forumCategories = pgTable("forum_categories", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  forumId: text("forum_id").notNull().references(() => forums.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 80 }).notNull(),
  translations: jsonb("translations").$type<ForumCategoryTranslations>().default({}).notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [uniqueIndex("forum_categories_forum_slug_uidx").on(t.forumId, t.slug), index("forum_categories_order_idx").on(t.forumId, t.position)]);

export const forumTags = pgTable("forum_tags", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 40 }).notNull(),
  label: varchar("label", { length: 40 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("forum_tags_site_slug_uidx").on(t.siteId, t.slug)]);

export const forumTopics = pgTable("forum_topics", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  forumId: text("forum_id").notNull().references(() => forums.id, { onDelete: "cascade" }),
  categoryId: text("category_id").notNull().references(() => forumCategories.id, { onDelete: "restrict" }),
  siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
  authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  bodyHtml: text("body_html").notNull(),
  status: varchar("status", { length: 12, enum: FORUM_CONTENT_STATUSES }).default("visible").notNull(),
  isPrivate: boolean("is_private").default(false).notNull(),
  locked: boolean("locked").default(false).notNull(),
  pinned: boolean("pinned").default(false).notNull(),
  score: integer("score").default(0).notNull(),
  replyCount: integer("reply_count").default(0).notNull(),
  acceptedPostId: text("accepted_post_id"),
  lastPostAt: timestamp("last_post_at", { withTimezone: true }).defaultNow().notNull(),
  moderatedAt: timestamp("moderated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  searchVector: tsvector("search_vector").generatedAlwaysAs(sql`to_tsvector('simple'::regconfig, coalesce("title", '') || ' ' || coalesce("body", ''))`),
}, (t) => [
  index("forum_topics_list_idx").on(t.forumId, t.status, t.pinned, t.lastPostAt),
  index("forum_topics_category_idx").on(t.categoryId, t.status, t.lastPostAt),
  index("forum_topics_author_idx").on(t.authorId, t.siteId, t.moderatedAt),
  index("forum_topics_search_idx").using("gin", t.searchVector),
  check("forum_topics_status_check", sql`${t.status} IN ('visible', 'hidden', 'spam')`),
]);

export const forumPosts = pgTable("forum_posts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  topicId: text("topic_id").notNull().references(() => forumTopics.id, { onDelete: "cascade" }),
  siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
  authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  bodyHtml: text("body_html").notNull(),
  status: varchar("status", { length: 12, enum: FORUM_CONTENT_STATUSES }).default("visible").notNull(),
  score: integer("score").default(0).notNull(),
  moderatedAt: timestamp("moderated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  searchVector: tsvector("search_vector").generatedAlwaysAs(sql`to_tsvector('simple'::regconfig, coalesce("body", ''))`),
}, (t) => [
  index("forum_posts_topic_idx").on(t.topicId, t.status, t.createdAt),
  index("forum_posts_author_idx").on(t.authorId, t.siteId, t.moderatedAt),
  index("forum_posts_search_idx").using("gin", t.searchVector),
  check("forum_posts_status_check", sql`${t.status} IN ('visible', 'hidden', 'spam')`),
]);

export const forumTopicTags = pgTable("forum_topic_tags", {
  topicId: text("topic_id").notNull().references(() => forumTopics.id, { onDelete: "cascade" }),
  tagId: text("tag_id").notNull().references(() => forumTags.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.topicId, t.tagId], name: "forum_topic_tags_pkey" }), index("forum_topic_tags_tag_idx").on(t.tagId)]);

/** Un vote (+1 / −1) par utilisateur et par cible. */
export const forumVotes = pgTable("forum_votes", {
  targetType: varchar("target_type", { length: 8, enum: FORUM_VOTE_TARGETS }).notNull(),
  targetId: text("target_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  value: smallint("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.targetType, t.targetId, t.userId], name: "forum_votes_pkey" }),
  check("forum_votes_value_check", sql`${t.value} IN (-1, 1)`),
  check("forum_votes_target_check", sql`${t.targetType} IN ('topic', 'post')`),
]);

/** Réactions : une par type de réaction, par utilisateur et par cible. */
export const forumReactions = pgTable("forum_reactions", {
  targetType: varchar("target_type", { length: 8, enum: FORUM_VOTE_TARGETS }).notNull(),
  targetId: text("target_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  reaction: varchar("reaction", { length: 16, enum: FORUM_REACTIONS }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.targetType, t.targetId, t.userId, t.reaction], name: "forum_reactions_pkey" }),
  index("forum_reactions_target_idx").on(t.targetType, t.targetId),
]);

/** Réputation par site, recalculée depuis les sources (votes reçus, réponses acceptées). */
export const forumUserStats = pgTable("forum_user_stats", {
  siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  reputation: integer("reputation").default(0).notNull(),
  topics: integer("topics").default(0).notNull(),
  posts: integer("posts").default(0).notNull(),
  acceptedAnswers: integer("accepted_answers").default(0).notNull(),
  upvotesReceived: integer("upvotes_received").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.siteId, t.userId], name: "forum_user_stats_pkey" })]);

export const forumPolls = pgTable("forum_polls", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  topicId: text("topic_id").notNull().unique().references(() => forumTopics.id, { onDelete: "cascade" }),
  question: varchar("question", { length: 200 }).notNull(),
  multiple: boolean("multiple").default(false).notNull(),
  resultsVisibility: varchar("results_visibility", { length: 16, enum: FORUM_POLL_RESULTS }).default("always").notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [check("forum_polls_results_check", sql`${t.resultsVisibility} IN ('always', 'after_vote', 'after_close')`)]);

export const forumPollOptions = pgTable("forum_poll_options", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pollId: text("poll_id").notNull().references(() => forumPolls.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 120 }).notNull(),
  position: integer("position").default(0).notNull(),
}, (t) => [index("forum_poll_options_poll_idx").on(t.pollId, t.position)]);

/** Bulletin : un seul par utilisateur et par sondage (choix simple ou multiple). */
export const forumPollBallots = pgTable("forum_poll_ballots", {
  pollId: text("poll_id").notNull().references(() => forumPolls.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.pollId, t.userId], name: "forum_poll_ballots_pkey" })]);

export const forumPollVotes = pgTable("forum_poll_votes", {
  pollId: text("poll_id").notNull().references(() => forumPolls.id, { onDelete: "cascade" }),
  optionId: text("option_id").notNull().references(() => forumPollOptions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.pollId, t.userId, t.optionId], name: "forum_poll_votes_pkey" }), index("forum_poll_votes_option_idx").on(t.optionId)]);

/** Fils privés : seuls les participants voient le sujet. */
export const forumTopicParticipants = pgTable("forum_topic_participants", {
  topicId: text("topic_id").notNull().references(() => forumTopics.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.topicId, t.userId], name: "forum_topic_participants_pkey" }), index("forum_topic_participants_user_idx").on(t.userId)]);

export const forumTopicFollows = pgTable("forum_topic_follows", {
  topicId: text("topic_id").notNull().references(() => forumTopics.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.topicId, t.userId], name: "forum_topic_follows_pkey" }), index("forum_topic_follows_user_idx").on(t.userId)]);

/** Politique de sanctions automatiques par site (seuils configurables par l'administration). */
export const forumSanctionPolicies = pgTable("forum_sanction_policies", {
  siteId: text("site_id").primaryKey().references(() => sites.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").default(true).notNull(),
  windowDays: integer("window_days").default(30).notNull(),
  muteThreshold: integer("mute_threshold").default(3).notNull(),
  muteHours: integer("mute_hours").default(24).notNull(),
  suspendThreshold: integer("suspend_threshold").default(5).notNull(),
  suspendDays: integer("suspend_days").default(7).notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("forum_sanction_policies_bounds", sql`${t.windowDays} BETWEEN 1 AND 365 AND ${t.muteThreshold} BETWEEN 1 AND 100 AND ${t.suspendThreshold} > ${t.muteThreshold} AND ${t.suspendThreshold} <= 200 AND ${t.muteHours} BETWEEN 1 AND 720 AND ${t.suspendDays} BETWEEN 1 AND 365`),
]);

export const forumSanctions = pgTable("forum_sanctions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 12, enum: FORUM_SANCTION_KINDS }).notNull(),
  automatic: boolean("automatic").default(true).notNull(),
  /** Nombre de contenus masqués (signalements retenus) dans la fenêtre au déclenchement. */
  triggerCount: integer("trigger_count").default(0).notNull(),
  note: text("note"),
  startsAt: timestamp("starts_at", { withTimezone: true }).defaultNow().notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by").references(() => user.id, { onDelete: "set null" }),
  revokeNote: text("revoke_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("forum_sanctions_active_idx").on(t.siteId, t.userId, t.endsAt),
  check("forum_sanctions_kind_check", sql`${t.kind} IN ('mute', 'suspension')`),
  check("forum_sanctions_period_check", sql`${t.endsAt} > ${t.startsAt}`),
]);
