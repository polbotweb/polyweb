import { pgTable, text, varchar, timestamp, index, uniqueIndex, check, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user, organization } from "./auth.schema";

/** Messagerie privée 1:1 (docs/messaging.md). Pas de chiffrement applicatif / E2E. */
export const MESSAGING_WHO_CAN = ["everyone", "shared_org", "nobody"] as const;
export type MessagingWhoCan = (typeof MESSAGING_WHO_CAN)[number];
export const MESSAGING_MESSAGE_STATUSES = ["visible", "hidden"] as const;
export type MessagingMessageStatus = (typeof MESSAGING_MESSAGE_STATUSES)[number];

export const messagingPreferences = pgTable("messaging_preferences", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  whoCanMessage: varchar("who_can_message", { length: 16, enum: MESSAGING_WHO_CAN }).default("shared_org").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [check("messaging_preferences_who_check", sql`${t.whoCanMessage} IN ('everyone', 'shared_org', 'nobody')`)]);

export const messagingBlocks = pgTable("messaging_blocks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  blockerId: text("blocker_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  blockedId: text("blocked_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("messaging_blocks_pair_uidx").on(t.blockerId, t.blockedId),
  index("messaging_blocks_blocked_idx").on(t.blockedId),
  check("messaging_blocks_distinct", sql`${t.blockerId} <> ${t.blockedId}`),
]);

export const messagingConversations = pgTable("messaging_conversations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userLo: text("user_lo").notNull().references(() => user.id, { onDelete: "cascade" }),
  userHi: text("user_hi").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("messaging_conversations_pair_uidx").on(t.userLo, t.userHi),
  check("messaging_conversations_ordered", sql`${t.userLo} < ${t.userHi}`),
  index("messaging_conversations_last_idx").on(t.lastMessageAt),
]);

export const messagingConversationStates = pgTable("messaging_conversation_states", {
  conversationId: text("conversation_id").notNull().references(() => messagingConversations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  primaryKey({ columns: [t.conversationId, t.userId] }),
  index("messaging_conversation_states_user_idx").on(t.userId, t.deletedAt),
]);

export const messagingMessages = pgTable("messaging_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conversationId: text("conversation_id").notNull().references(() => messagingConversations.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  status: varchar("status", { length: 12, enum: MESSAGING_MESSAGE_STATUSES }).default("visible").notNull(),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("messaging_messages_conversation_idx").on(t.conversationId, t.createdAt),
  index("messaging_messages_org_idx").on(t.organizationId, t.status),
  check("messaging_messages_status_check", sql`${t.status} IN ('visible', 'hidden')`),
]);
