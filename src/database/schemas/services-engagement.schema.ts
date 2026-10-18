import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, integer, uniqueIndex, index, primaryKey, check } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.schema";
import { services, serviceComments, serviceReviews } from "./services.schema";

export const serviceReactions = pgTable(
  "service_reactions",
  { serviceId: text("service_id").notNull().references(() => services.id, { onDelete: "cascade" }), userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }), reactionType: text("reaction_type", { enum: ["LIKE", "LOVE", "FIRE", "CLAP"] }).notNull(), createdAt: timestamp("created_at").defaultNow().notNull(), updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull() },
  (table) => [primaryKey({ columns: [table.serviceId, table.userId] }), index("service_reactions_type_idx").on(table.serviceId, table.reactionType)],
);

export const serviceNotifications = pgTable(
  "service_notifications",
  { id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()), recipientId: text("recipient_id").notNull().references(() => user.id, { onDelete: "cascade" }), actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }), serviceId: text("service_id").notNull().references(() => services.id, { onDelete: "cascade" }), commentId: text("comment_id").references(() => serviceComments.id, { onDelete: "cascade" }), reviewId: text("review_id").references(() => serviceReviews.id, { onDelete: "cascade" }), type: text("type", { enum: ["NEW_COMMENT", "REPLY_TO_COMMENT", "NEW_REVIEW", "REVIEW_APPROVED", "REVIEW_REJECTED", "SERVICE_PUBLISHED", "SERVICE_MENTION"] }).notNull(), title: text("title").notNull(), message: text("message").notNull(), readAt: timestamp("read_at"), createdAt: timestamp("created_at").defaultNow().notNull() },
  (table) => [
    index("service_notifications_recipient_idx").on(table.recipientId, table.readAt),
    index("service_notifications_service_idx").on(table.serviceId),
    index("service_notifications_created_idx").on(table.createdAt),
    check("service_notification_target_consistency", sql`CASE WHEN ${table.type} IN ('NEW_COMMENT','REPLY_TO_COMMENT') THEN ${table.commentId} IS NOT NULL AND ${table.reviewId} IS NULL WHEN ${table.type} IN ('NEW_REVIEW','REVIEW_APPROVED','REVIEW_REJECTED') THEN ${table.reviewId} IS NOT NULL AND ${table.commentId} IS NULL WHEN ${table.type} IN ('SERVICE_PUBLISHED','SERVICE_MENTION') THEN ${table.commentId} IS NULL AND ${table.reviewId} IS NULL ELSE FALSE END`),
  ],
);

export const serviceAttributeDefinitions = pgTable(
  "service_attribute_definitions",
  { id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()), organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }), key: text("key").notNull(), label: text("label").notNull(), type: text("type", { enum: ["STRING", "NUMBER", "BOOLEAN", "SELECT"] }).notNull(), options: text("options"), required: boolean("required").default(false).notNull(), sortOrder: integer("sort_order").default(0).notNull(), createdAt: timestamp("created_at").defaultNow().notNull(), updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull() },
  (table) => [uniqueIndex("service_attribute_definitions_org_key_uidx").on(table.organizationId, table.key), uniqueIndex("service_attribute_definitions_global_key_uidx").on(table.key).where(sql`${table.organizationId} IS NULL`), index("service_attribute_definitions_org_idx").on(table.organizationId)],
);

export const serviceAttributeValues = pgTable(
  "service_attribute_values",
  { serviceId: text("service_id").notNull().references(() => services.id, { onDelete: "cascade" }), definitionId: text("definition_id").notNull().references(() => serviceAttributeDefinitions.id, { onDelete: "cascade" }), stringValue: text("string_value"), numberValue: integer("number_value"), booleanValue: boolean("boolean_value"), selectedValue: text("selected_value"), updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull() },
  (table) => [primaryKey({ columns: [table.serviceId, table.definitionId] }), index("service_attribute_values_definition_idx").on(table.definitionId)],
);

export const serviceReviewHelpful = pgTable(
  "service_review_helpful",
  {
    reviewId: text("review_id").notNull().references(() => serviceReviews.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    isHelpful: boolean("is_helpful").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.reviewId, table.userId] }),
    index("service_review_helpful_user_idx").on(table.userId),
  ],
);
