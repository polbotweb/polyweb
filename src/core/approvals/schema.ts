/**
 * Tables génériques d'approbation (core/approvals), partagées par les modules.
 * Exportées depuis `src/database/schemas.ts` ; migration 0057.
 */
import { bigint, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization, user } from "@database/schemas/auth.schema";
import { APPROVAL_MODES, APPROVAL_REQUEST_STATUSES, APPROVAL_ROLES, APPROVAL_STEP_STATUSES } from "./types";

export const approvalPolicies = pgTable("approval_policies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  module: text("module").notNull(),
  resourceType: text("resource_type").notNull(),
  mode: text("mode", { enum: APPROVAL_MODES }).default("none").notNull(),
  thresholdMinor: bigint("threshold_minor", { mode: "number" }).default(0).notNull(),
  currency: text("currency").default("EUR").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("approval_policies_org_resource_uidx").on(sql`coalesce(${table.organizationId}, '')`, table.module, table.resourceType),
]);

export const approvalBands = pgTable("approval_bands", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  policyId: text("policy_id").notNull().references(() => approvalPolicies.id, { onDelete: "cascade" }),
  level: integer("level").notNull(),
  minMinor: bigint("min_minor", { mode: "number" }).notNull(),
  maxMinor: bigint("max_minor", { mode: "number" }),
  requiredRole: text("required_role", { enum: APPROVAL_ROLES }).default("orgAdmin").notNull(),
  requiredPermission: text("required_permission"),
}, (table) => [
  uniqueIndex("approval_bands_policy_level_uidx").on(table.policyId, table.level),
]);

export const approvalRequests = pgTable("approval_requests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  module: text("module").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  policyId: text("policy_id").references(() => approvalPolicies.id, { onDelete: "set null" }),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  status: text("status", { enum: APPROVAL_REQUEST_STATUSES }).default("PENDING").notNull(),
  requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at"),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("approval_requests_resource_idx").on(table.module, table.resourceType, table.resourceId),
  index("approval_requests_org_status_idx").on(table.organizationId, table.status),
]);

export const approvalSteps = pgTable("approval_steps", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  requestId: text("request_id").notNull().references(() => approvalRequests.id, { onDelete: "cascade" }),
  level: integer("level").notNull(),
  requiredRole: text("required_role", { enum: APPROVAL_ROLES }).notNull(),
  requiredPermission: text("required_permission"),
  status: text("status", { enum: APPROVAL_STEP_STATUSES }).default("WAITING").notNull(),
  decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at"),
  comment: text("comment"),
}, (table) => [
  uniqueIndex("approval_steps_request_level_uidx").on(table.requestId, table.level),
]);
