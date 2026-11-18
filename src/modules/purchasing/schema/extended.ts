
/**
 * Extension achats (migration 0057) : réglages, contacts, catalogue, factures / avoirs,
 * règlements, réassort, retours, qualité, frais d'approche, imports e-facture, SEPA, punch-out.
 */
import { bigint, boolean, integer, numeric, pgTable, text, timestamp, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization, user } from "@database/schemas/auth.schema";
import { crmCompanies, crmContacts } from "@/modules/crm/schema";
import { logisticsItems, logisticsWarehouses } from "@/modules/logistics/schema";
import { approvalRequests } from "@/core/approvals/schema";
import { purchasing, purchasingOrderLines, purchasingReceiptLines, purchasingReceipts, purchasingSuppliers } from "./index";
import { REORDER_MODES, MATCHING_MODES, MATCHING_POLICIES, EMAIL_TEMPLATE_PURPOSES } from "../domain/settings";
import { SUPPLIER_INVOICE_KINDS, SUPPLIER_INVOICE_STATUSES } from "../domain/invoice";
import { MATCH_STATUSES } from "../domain/matching";
import { SUPPLIER_RETURN_STATUSES, QUALITY_RESULTS, RETURN_REASONS } from "../domain/returns";
import { LANDED_COST_CATEGORIES, LANDED_COST_METHODS } from "../domain/landed-costs";
import { PAYMENT_METHODS } from "../domain/payments";

export const PURCHASE_LINE_KINDS = ["stock", "service"] as const;
export type PurchaseLineKind = (typeof PURCHASE_LINE_KINDS)[number];
export const PURCHASE_ORDER_ORIGINS = ["manual", "reorder", "punchout", "einvoice"] as const;

export const purchasingSettings = pgTable("purchasing_settings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  reorderMode: text("reorder_mode", { enum: REORDER_MODES }).default("suggestions").notNull(),
  reorderHour: integer("reorder_hour").default(6).notNull(),
  reorderIncludeReservations: boolean("reorder_include_reservations").default(false).notNull(),
  reorderAutoSendTrustedOnly: boolean("reorder_auto_send_trusted_only").default(true).notNull(),
  matchingMode: text("matching_mode", { enum: MATCHING_MODES }).default("three_way").notNull(),
  toleranceAbsoluteMinor: bigint("tolerance_absolute_minor", { mode: "number" }).default(100).notNull(),
  tolerancePercent: numeric("tolerance_percent", { precision: 7, scale: 4 }).default("1").notNull(),
  matchingPolicy: text("matching_policy", { enum: MATCHING_POLICIES }).default("allow_with_acceptance").notNull(),
  defaultTaxCategory: text("default_tax_category").default("standard").notNull(),
  defaultPaymentTermDays: integer("default_payment_term_days").default(30).notNull(),
  defaultCurrency: text("default_currency").default("EUR").notNull(),
  qualityControlRequired: boolean("quality_control_required").default(false).notNull(),
  allowServiceLines: boolean("allow_service_lines").default(true).notNull(),
  allowMultiWarehouse: boolean("allow_multi_warehouse").default(true).notNull(),
  poPrefix: text("po_prefix").default("BC").notNull(),
  receiptPrefix: text("receipt_prefix").default("BR").notNull(),
  invoicePrefix: text("invoice_prefix").default("FF").notNull(),
  creditPrefix: text("credit_prefix").default("AF").notNull(),
  returnPrefix: text("return_prefix").default("RF").notNull(),
  sepaPrefix: text("sepa_prefix").default("SEPA").notNull(),
  debtorName: text("debtor_name"),
  debtorIban: text("debtor_iban"),
  debtorBic: text("debtor_bic"),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("purchasing_settings_org_uidx").on(sql`coalesce(${table.organizationId}, '')`),
]);

export const purchasingEmailTemplates = pgTable("purchasing_email_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  locale: text("locale").notNull(),
  purpose: text("purpose", { enum: EMAIL_TEMPLATE_PURPOSES }).notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("purchasing_email_templates_uidx").on(sql`coalesce(${table.organizationId}, '')`, table.locale, table.purpose),
]);

export const purchasingSupplierContacts = pgTable("purchasing_supplier_contacts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  supplierId: text("supplier_id").notNull().references(() => purchasingSuppliers.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  firstName: text("first_name"),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role"),
  isPrimary: boolean("is_primary").default(false).notNull(),
  crmContactId: text("crm_contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [index("purchasing_supplier_contacts_supplier_idx").on(table.supplierId)]);

export const purchasingSupplierItems = pgTable("purchasing_supplier_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  supplierId: text("supplier_id").notNull().references(() => purchasingSuppliers.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  itemId: text("item_id").references(() => logisticsItems.id, { onDelete: "no action" }),
  supplierSku: text("supplier_sku"),
  description: text("description"),
  unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
  currency: text("currency").default("EUR").notNull(),
  leadTimeDays: integer("lead_time_days").default(0).notNull(),
  minOrderQty: integer("min_order_qty").default(1).notNull(),
  packQty: integer("pack_qty").default(1).notNull(),
  preferred: boolean("preferred").default(false).notNull(),
  validFrom: timestamp("valid_from", { mode: "string" }),
  validTo: timestamp("valid_to", { mode: "string" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("purchasing_supplier_items_supplier_idx").on(table.supplierId, table.itemId),
  check("purchasing_supplier_items_price_ck", sql`${table.unitPriceMinor} >= 0`),
  check("purchasing_supplier_items_qty_ck", sql`${table.minOrderQty} > 0 AND ${table.packQty} > 0`),
]);

export const purchasingInvoices = pgTable("purchasing_invoices", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: SUPPLIER_INVOICE_KINDS }).default("invoice").notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: SUPPLIER_INVOICE_STATUSES }).default("DRAFT").notNull(),
  number: text("number"),
  supplierInvoiceNumber: text("supplier_invoice_number"),
  supplierId: text("supplier_id").notNull().references(() => purchasingSuppliers.id, { onDelete: "no action" }),
  sourceInvoiceId: text("source_invoice_id"),
  currency: text("currency").default("EUR").notNull(),
  baseCurrency: text("base_currency"),
  exchangeRate: text("exchange_rate"),
  exchangeRateDate: text("exchange_rate_date"),
  netBaseMinor: bigint("net_base_minor", { mode: "number" }),
  taxBaseMinor: bigint("tax_base_minor", { mode: "number" }),
  grossBaseMinor: bigint("gross_base_minor", { mode: "number" }),
  issueDate: text("issue_date"),
  dueDate: text("due_date"),
  paymentTermDays: integer("payment_term_days").default(30).notNull(),
  netMinor: bigint("net_minor", { mode: "number" }).default(0).notNull(),
  taxMinor: bigint("tax_minor", { mode: "number" }).default(0).notNull(),
  grossMinor: bigint("gross_minor", { mode: "number" }).default(0).notNull(),
  paidMinor: bigint("paid_minor", { mode: "number" }).default(0).notNull(),
  creditedMinor: bigint("credited_minor", { mode: "number" }).default(0).notNull(),
  matchStatus: text("match_status", { enum: MATCH_STATUSES }).default("unmatched").notNull(),
  storageKey: text("storage_key"),
  importId: text("import_id"),
  orderId: text("order_id").references(() => purchasing.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("purchasing_invoices_org_slug_uidx").on(table.organizationId, table.slug),
  uniqueIndex("purchasing_invoices_org_kind_number_uidx").on(sql`coalesce(${table.organizationId}, '')`, table.kind, table.number).where(sql`${table.number} is not null`),
  uniqueIndex("purchasing_invoices_supplier_number_uidx").on(table.supplierId, table.supplierInvoiceNumber).where(sql`${table.supplierInvoiceNumber} is not null`),
  index("purchasing_invoices_org_status_idx").on(table.organizationId, table.status),
  index("purchasing_invoices_order_idx").on(table.orderId),
]);

export const purchasingInvoiceLines = pgTable("purchasing_invoice_lines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  invoiceId: text("invoice_id").notNull().references(() => purchasingInvoices.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  kind: text("kind", { enum: PURCHASE_LINE_KINDS }).default("stock").notNull(),
  itemId: text("item_id").references(() => logisticsItems.id, { onDelete: "no action" }),
  sku: text("sku"),
  description: text("description"),
  quantity: integer("quantity").notNull(),
  unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
  taxCategory: text("tax_category").default("standard").notNull(),
  ratePercent: numeric("rate_percent", { precision: 7, scale: 4 }).default("0").notNull(),
  netMinor: bigint("net_minor", { mode: "number" }).default(0).notNull(),
  taxMinor: bigint("tax_minor", { mode: "number" }).default(0).notNull(),
  orderLineId: text("order_line_id").references(() => purchasingOrderLines.id, { onDelete: "set null" }),
  receiptLineId: text("receipt_line_id").references(() => purchasingReceiptLines.id, { onDelete: "set null" }),
  matchStatus: text("match_status", { enum: MATCH_STATUSES }).default("unmatched").notNull(),
  accepted: boolean("accepted").default(false).notNull(),
}, (table) => [
  uniqueIndex("purchasing_invoice_lines_pos_uidx").on(table.invoiceId, table.position),
  check("purchasing_invoice_lines_qty_ck", sql`${table.quantity} > 0`),
]);

export const purchasingInvoiceRevisions = pgTable("purchasing_invoice_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().references(() => purchasingInvoices.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: SUPPLIER_INVOICE_STATUSES }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("purchasing_invoice_revisions_resource_idx").on(table.resourceId)]);

export const purchasingInvoiceLocks = pgTable("purchasing_invoice_locks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().unique().references(() => purchasingInvoices.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const purchasingPayments = pgTable("purchasing_payments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  invoiceId: text("invoice_id").notNull().references(() => purchasingInvoices.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  method: text("method", { enum: PAYMENT_METHODS }).default("bank_transfer").notNull(),
  paidAt: text("paid_at").notNull(),
  reference: text("reference"),
  sepaExportId: text("sepa_export_id"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("purchasing_payments_invoice_idx").on(table.invoiceId)]);

export const purchasingReorderRules = pgTable("purchasing_reorder_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull().references(() => logisticsItems.id, { onDelete: "cascade" }),
  warehouseId: text("warehouse_id").notNull().references(() => logisticsWarehouses.id, { onDelete: "cascade" }),
  minQty: integer("min_qty").notNull(),
  maxQty: integer("max_qty").notNull(),
  packQty: integer("pack_qty").default(1).notNull(),
  preferredSupplierId: text("preferred_supplier_id").references(() => purchasingSuppliers.id, { onDelete: "set null" }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("purchasing_reorder_rules_item_wh_uidx").on(sql`coalesce(${table.organizationId}, '')`, table.itemId, table.warehouseId),
  check("purchasing_reorder_rules_qty_ck", sql`${table.minQty} >= 0 AND ${table.maxQty} >= ${table.minQty} AND ${table.packQty} > 0`),
]);

export const purchasingReorderSuggestions = pgTable("purchasing_reorder_suggestions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  ruleId: text("rule_id").references(() => purchasingReorderRules.id, { onDelete: "set null" }),
  itemId: text("item_id").notNull().references(() => logisticsItems.id, { onDelete: "cascade" }),
  warehouseId: text("warehouse_id").notNull().references(() => logisticsWarehouses.id, { onDelete: "cascade" }),
  supplierId: text("supplier_id").references(() => purchasingSuppliers.id, { onDelete: "set null" }),
  onHand: integer("on_hand").notNull(),
  outstanding: integer("outstanding").notNull(),
  reserved: integer("reserved").default(0).notNull(),
  suggestedQty: integer("suggested_qty").notNull(),
  status: text("status").default("open").notNull(),
  orderId: text("order_id").references(() => purchasing.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("purchasing_reorder_suggestions_org_idx").on(table.organizationId, table.status)]);

export const purchasingReturns = pgTable("purchasing_returns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  number: text("number"),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: SUPPLIER_RETURN_STATUSES }).default("DRAFT").notNull(),
  supplierId: text("supplier_id").notNull().references(() => purchasingSuppliers.id, { onDelete: "no action" }),
  warehouseId: text("warehouse_id").notNull().references(() => logisticsWarehouses.id, { onDelete: "no action" }),
  orderId: text("order_id").references(() => purchasing.id, { onDelete: "set null" }),
  invoiceId: text("invoice_id").references(() => purchasingInvoices.id, { onDelete: "set null" }),
  reason: text("reason", { enum: RETURN_REASONS }).default("other").notNull(),
  notes: text("notes"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("purchasing_returns_org_slug_uidx").on(table.organizationId, table.slug),
  uniqueIndex("purchasing_returns_org_number_uidx").on(table.organizationId, table.number),
]);

export const purchasingReturnLines = pgTable("purchasing_return_lines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  returnId: text("return_id").notNull().references(() => purchasingReturns.id, { onDelete: "cascade" }),
  receiptLineId: text("receipt_line_id").references(() => purchasingReceiptLines.id, { onDelete: "set null" }),
  itemId: text("item_id").references(() => logisticsItems.id, { onDelete: "no action" }),
  sku: text("sku").notNull(),
  quantity: integer("quantity").notNull(),
  movementId: text("movement_id"),
  reason: text("reason", { enum: RETURN_REASONS }),
}, (table) => [check("purchasing_return_lines_qty_ck", sql`${table.quantity} > 0`)]);

export const purchasingQualityChecks = pgTable("purchasing_quality_checks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  receiptId: text("receipt_id").notNull().references(() => purchasingReceipts.id, { onDelete: "cascade" }),
  status: text("status", { enum: QUALITY_RESULTS }).default("pending").notNull(),
  notes: text("notes"),
  checkedBy: text("checked_by").references(() => user.id, { onDelete: "set null" }),
  checkedAt: timestamp("checked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("purchasing_quality_checks_receipt_uidx").on(table.receiptId)]);

export const purchasingQualityCheckLines = pgTable("purchasing_quality_check_lines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  checkId: text("check_id").notNull().references(() => purchasingQualityChecks.id, { onDelete: "cascade" }),
  receiptLineId: text("receipt_line_id").notNull().references(() => purchasingReceiptLines.id, { onDelete: "cascade" }),
  accepted: integer("accepted").default(0).notNull(),
  rejected: integer("rejected").default(0).notNull(),
  result: text("result", { enum: QUALITY_RESULTS }).default("pending").notNull(),
  notes: text("notes"),
});

export const purchasingLandedCosts = pgTable("purchasing_landed_costs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull().references(() => purchasing.id, { onDelete: "cascade" }),
  invoiceId: text("invoice_id").references(() => purchasingInvoices.id, { onDelete: "set null" }),
  category: text("category", { enum: LANDED_COST_CATEGORIES }).default("freight").notNull(),
  method: text("method", { enum: LANDED_COST_METHODS }).default("value").notNull(),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  currency: text("currency").default("EUR").notNull(),
  allocated: boolean("allocated").default(false).notNull(),
  notes: text("notes"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("purchasing_landed_costs_order_idx").on(table.orderId)]);

export const purchasingLandedCostLines = pgTable("purchasing_landed_cost_lines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  landedCostId: text("landed_cost_id").notNull().references(() => purchasingLandedCosts.id, { onDelete: "cascade" }),
  orderLineId: text("order_line_id").notNull().references(() => purchasingOrderLines.id, { onDelete: "cascade" }),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
});

export const purchasingEinvoiceImports = pgTable("purchasing_einvoice_imports", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  format: text("format").notNull(),
  status: text("status").default("parsed").notNull(),
  error: text("error"),
  supplierId: text("supplier_id").references(() => purchasingSuppliers.id, { onDelete: "set null" }),
  invoiceId: text("invoice_id").references(() => purchasingInvoices.id, { onDelete: "set null" }),
  storageKey: text("storage_key"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("purchasing_einvoice_imports_org_idx").on(table.organizationId, table.createdAt)]);

export const purchasingSepaExports = pgTable("purchasing_sepa_exports", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  status: text("status").default("EXPORTED").notNull(),
  paymentCount: integer("payment_count").notNull(),
  totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
  currency: text("currency").default("EUR").notNull(),
  storageKey: text("storage_key").notNull(),
  sha256: text("sha256").notNull(),
  requestedExecutionDate: text("requested_execution_date").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("purchasing_sepa_exports_org_number_uidx").on(sql`coalesce(${table.organizationId}, '')`, table.number)]);

export const purchasingPunchoutSessions = pgTable("purchasing_punchout_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  supplierId: text("supplier_id").notNull().references(() => purchasingSuppliers.id, { onDelete: "cascade" }),
  buyerCookie: text("buyer_cookie").notNull(),
  status: text("status").default("pending").notNull(),
  hookUrl: text("hook_url"),
  orderId: text("order_id").references(() => purchasing.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("purchasing_punchout_sessions_cookie_uidx").on(table.buyerCookie)]);
