/**
 * Tables du module banking (migration 0058) : réglages, comptes bancaires, profils CSV, imports,
 * relevés, lignes de relevé, rapprochements (lignes, affectations), grand livre banque, règles,
 * flux bancaires (GoCardless) et versements Stripe. Montants en unités mineures (`bigint` mode
 * number) ; dates comptables en `date` (chaînes AAAA-MM-JJ). Tout est cloisonné par organisation
 * (`organization_id`, `null` = plateforme).
 */
import { bigint, boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization, user } from "@database/schemas/auth.schema";
import { approvalRequests } from "@/core/approvals/schema";
import type { ReconCandidate } from "@/core/reconciliation/types";
import {
  ACCOUNT_STATUSES, ADJUSTMENT_KINDS, AUTOMATION_MODES, CONTINUITY_STATUSES, FEED_PROVIDERS, FEED_STATUSES, IMPORT_SOURCES, IMPORT_STATUSES, LEDGER_KINDS,
  PAYOUT_ITEM_TYPES, PAYOUT_STATUSES, RECONCILIATION_MODES, RECONCILIATION_STATUSES, STATEMENT_FORMATS, STATEMENT_KINDS, TRANSACTION_STATUSES,
} from "../domain/constants";
import type { CsvProfile } from "../domain/parsers/csv";
import type { RuleActions, RuleConditions } from "../domain/rules";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const org = () => text("organization_id").references(() => organization.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at").defaultNow().notNull();
const updatedAt = () => timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull();
const minor = (name: string) => bigint(name, { mode: "number" });

/** Réglages par organisation (JSON validé par `resolveBankingSettings`, défauts implicites). */
export const bankSettings = pgTable("bank_settings", {
  id: id(),
  organizationId: org(),
  config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("bank_settings_org_uidx").on(sql`coalesce(${table.organizationId}, '')`)]);

/** Profils d'import CSV réutilisables (préréglage modifié ou profil maison). */
export const bankCsvProfiles = pgTable("bank_csv_profiles", {
  id: id(),
  organizationId: org(),
  name: text("name").notNull(),
  profile: jsonb("profile").$type<CsvProfile>().notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("bank_csv_profiles_org_name_uidx").on(sql`coalesce(${table.organizationId}, '')`, table.name)]);

/** Comptes bancaires (un journal et un compte 512xxx chacun). */
export const bankAccounts = pgTable("bank_accounts", {
  id: id(),
  organizationId: org(),
  label: text("label").notNull(),
  iban: text("iban"),
  bic: text("bic"),
  accountNumber: text("account_number"),
  bankName: text("bank_name"),
  currency: text("currency").default("EUR").notNull(),
  ledgerAccount: text("ledger_account").default("512000").notNull(),
  journalCode: text("journal_code").default("BQ").notNull(),
  journalLabel: text("journal_label").default("Banque").notNull(),
  openingBalanceMinor: minor("opening_balance_minor"),
  openingBalanceDate: date("opening_balance_date", { mode: "string" }),
  defaultFormat: text("default_format", { enum: STATEMENT_FORMATS }),
  csvProfileId: text("csv_profile_id").references(() => bankCsvProfiles.id, { onDelete: "set null" }),
  automationMode: text("automation_mode", { enum: AUTOMATION_MODES }),
  status: text("status", { enum: ACCOUNT_STATUSES }).default("active").notNull(),
  lastClosingBalanceMinor: minor("last_closing_balance_minor"),
  lastClosingDate: date("last_closing_date", { mode: "string" }),
  lastSequence: text("last_sequence"),
  continuityStatus: text("continuity_status", { enum: CONTINUITY_STATUSES }).default("unknown").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("bank_accounts_org_iban_uidx").on(sql`coalesce(${table.organizationId}, '')`, table.iban).where(sql`${table.iban} is not null`),
  index("bank_accounts_org_idx").on(table.organizationId),
]);

/** Fichiers importés (et synchronisations de flux) : empreinte SHA-256 unique par compte. */
export const bankImports = pgTable("bank_imports", {
  id: id(),
  organizationId: org(),
  bankAccountId: text("bank_account_id").notNull().references(() => bankAccounts.id, { onDelete: "cascade" }),
  source: text("source", { enum: IMPORT_SOURCES }).default("upload").notNull(),
  format: text("format", { enum: STATEMENT_FORMATS }).notNull(),
  status: text("status", { enum: IMPORT_STATUSES }).notNull(),
  fileName: text("file_name"),
  storageKey: text("storage_key"),
  sha256: text("sha256").notNull(),
  sizeBytes: integer("size_bytes").default(0).notNull(),
  statementCount: integer("statement_count").default(0).notNull(),
  lineCount: integer("line_count").default(0).notNull(),
  insertedCount: integer("inserted_count").default(0).notNull(),
  duplicateCount: integer("duplicate_count").default(0).notNull(),
  mergedCount: integer("merged_count").default(0).notNull(),
  autoMatchedCount: integer("auto_matched_count").default(0).notNull(),
  error: text("error"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("bank_imports_account_sha_uidx").on(table.bankAccountId, table.sha256),
  index("bank_imports_org_created_idx").on(table.organizationId, table.createdAt),
]);

/** Relevés (définitifs, intrajournaliers, notifications) avec contrôle de continuité. */
export const bankStatements = pgTable("bank_statements", {
  id: id(),
  organizationId: org(),
  bankAccountId: text("bank_account_id").notNull().references(() => bankAccounts.id, { onDelete: "cascade" }),
  importId: text("import_id").notNull().references(() => bankImports.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: STATEMENT_KINDS }).default("statement").notNull(),
  externalId: text("external_id"),
  sequence: text("sequence"),
  fromDate: date("from_date", { mode: "string" }),
  toDate: date("to_date", { mode: "string" }),
  openingBalanceMinor: minor("opening_balance_minor"),
  closingBalanceMinor: minor("closing_balance_minor"),
  currency: text("currency").notNull(),
  lineCount: integer("line_count").default(0).notNull(),
  continuityStatus: text("continuity_status", { enum: CONTINUITY_STATUSES }).default("unknown").notNull(),
  continuityDeltaMinor: minor("continuity_delta_minor").default(0).notNull(),
  createdAt: createdAt(),
}, (table) => [index("bank_statements_account_to_idx").on(table.bankAccountId, table.toDate)]);

/** Suggestion stockée sur une ligne (meilleures propositions du moteur). */
export interface StoredSuggestion {
  readonly score: number;
  readonly candidates: readonly Pick<ReconCandidate, "source" | "id" | "label" | "openMinor" | "currency">[];
  readonly reasons: readonly string[];
}

/** Lignes de relevé (mouvements). L'empreinte rend tout réimport idempotent. */
export const bankTransactions = pgTable("bank_transactions", {
  id: id(),
  organizationId: org(),
  bankAccountId: text("bank_account_id").notNull().references(() => bankAccounts.id, { onDelete: "cascade" }),
  statementId: text("statement_id").references(() => bankStatements.id, { onDelete: "set null" }),
  fingerprint: text("fingerprint").notNull(),
  bookingDate: date("booking_date", { mode: "string" }).notNull(),
  valueDate: date("value_date", { mode: "string" }),
  amountMinor: minor("amount_minor").notNull(),
  currency: text("currency").notNull(),
  originalAmountMinor: minor("original_amount_minor"),
  originalCurrency: text("original_currency"),
  /** Contre-valeur EUR (devise de tenue) au cours BCE du jour, figée à l'import. */
  baseAmountMinor: minor("base_amount_minor"),
  baseRate: text("base_rate"),
  label: text("label").notNull(),
  counterpartyName: text("counterparty_name"),
  counterpartyIban: text("counterparty_iban"),
  endToEndId: text("end_to_end_id"),
  bankReference: text("bank_reference"),
  references: jsonb("references").$type<string[]>().default([]).notNull(),
  bankCode: text("bank_code"),
  returnReason: text("return_reason"),
  provisional: boolean("provisional").default(false).notNull(),
  status: text("status", { enum: TRANSACTION_STATUSES }).default("unmatched").notNull(),
  matchedMinor: minor("matched_minor").default(0).notNull(),
  suggestion: jsonb("suggestion").$type<StoredSuggestion | null>(),
  ruleId: text("rule_id"),
  note: text("note"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("bank_transactions_account_fp_uidx").on(table.bankAccountId, table.fingerprint),
  index("bank_transactions_org_account_date_idx").on(table.organizationId, table.bankAccountId, table.bookingDate),
  index("bank_transactions_org_status_idx").on(table.organizationId, table.status),
]);

/** Plan d'un rapprochement en attente d'approbation (rejoué tel quel à l'approbation). */
export interface StoredReconciliationPlan {
  readonly transactionIds: readonly string[];
  readonly allocations: readonly { readonly source: string; readonly targetId: string; readonly amountMinor: number }[];
  readonly adjustments: readonly { readonly kind: (typeof ADJUSTMENT_KINDS)[number]; readonly bankEffectMinor: number }[];
  readonly note: string | null;
}

/** Rapprochements : une ou plusieurs lignes contre une ou plusieurs pièces, écarts compris. */
export const bankReconciliations = pgTable("bank_reconciliations", {
  id: id(),
  organizationId: org(),
  status: text("status", { enum: RECONCILIATION_STATUSES }).notNull(),
  mode: text("mode", { enum: RECONCILIATION_MODES }).default("manual").notNull(),
  score: integer("score"),
  letteringCode: text("lettering_code"),
  date: date("date", { mode: "string" }).notNull(),
  currency: text("currency").notNull(),
  bankTotalMinor: minor("bank_total_minor").notNull(),
  allocatedMinor: minor("allocated_minor").notNull(),
  adjustmentMinor: minor("adjustment_minor").default(0).notNull(),
  approvalRequestId: text("approval_request_id").references(() => approvalRequests.id, { onDelete: "set null" }),
  plan: jsonb("plan").$type<StoredReconciliationPlan | null>(),
  note: text("note"),
  ruleId: text("rule_id"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  reversedBy: text("reversed_by").references(() => user.id, { onDelete: "set null" }),
  reversedAt: timestamp("reversed_at"),
  reversalReason: text("reversal_reason"),
  createdAt: createdAt(),
}, (table) => [index("bank_reconciliations_org_status_idx").on(table.organizationId, table.status, table.createdAt)]);

export const bankReconciliationLines = pgTable("bank_reconciliation_lines", {
  id: id(),
  reconciliationId: text("reconciliation_id").notNull().references(() => bankReconciliations.id, { onDelete: "cascade" }),
  transactionId: text("transaction_id").notNull().references(() => bankTransactions.id, { onDelete: "restrict" }),
  amountMinor: minor("amount_minor").notNull(),
}, (table) => [
  index("bank_reconciliation_lines_rec_idx").on(table.reconciliationId),
  index("bank_reconciliation_lines_tx_idx").on(table.transactionId),
]);

/** Affectations vers les pièces (source du registre core/reconciliation + identifiant). */
export const bankReconciliationAllocations = pgTable("bank_reconciliation_allocations", {
  id: id(),
  reconciliationId: text("reconciliation_id").notNull().references(() => bankReconciliations.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  targetId: text("target_id").notNull(),
  reference: text("reference"),
  amountMinor: minor("amount_minor").notNull(),
  currency: text("currency").notNull(),
  /** Paiements créés par l'application (pour la contrepassation). */
  effects: jsonb("effects").$type<{ readonly table: string; readonly id: string }[]>().default([]).notNull(),
}, (table) => [
  index("bank_reconciliation_allocations_rec_idx").on(table.reconciliationId),
  index("bank_reconciliation_allocations_target_idx").on(table.source, table.targetId),
]);

/** Grand livre banque : écritures propres à la banque, reprises dans le FEC. */
export const bankLedgerEntries = pgTable("bank_ledger_entries", {
  id: id(),
  organizationId: org(),
  bankAccountId: text("bank_account_id").references(() => bankAccounts.id, { onDelete: "restrict" }),
  reconciliationId: text("reconciliation_id").references(() => bankReconciliations.id, { onDelete: "set null" }),
  transactionId: text("transaction_id").references(() => bankTransactions.id, { onDelete: "set null" }),
  reversalOfId: text("reversal_of_id"),
  kind: text("kind", { enum: LEDGER_KINDS }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  journalCode: text("journal_code").notNull(),
  journalLabel: text("journal_label").notNull(),
  pieceRef: text("piece_ref").notNull(),
  label: text("label").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (table) => [index("bank_ledger_entries_org_date_idx").on(table.organizationId, table.date)]);

export const bankLedgerLines = pgTable("bank_ledger_lines", {
  id: id(),
  entryId: text("entry_id").notNull().references(() => bankLedgerEntries.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  account: text("account").notNull(),
  accountLabel: text("account_label").notNull(),
  auxAccount: text("aux_account"),
  auxLabel: text("aux_label"),
  label: text("label").notNull(),
  debitMinor: minor("debit_minor").default(0).notNull(),
  creditMinor: minor("credit_minor").default(0).notNull(),
  foreignMinor: minor("foreign_minor"),
  foreignCurrency: text("foreign_currency"),
  lettering: text("lettering"),
  letteringDate: date("lettering_date", { mode: "string" }),
}, (table) => [index("bank_ledger_lines_entry_idx").on(table.entryId)]);

/** Règles de rapprochement (ordre, conditions sans regex libre, action). */
export const bankRules = pgTable("bank_rules", {
  id: id(),
  organizationId: org(),
  name: text("name").notNull(),
  position: integer("position").default(100).notNull(),
  active: boolean("active").default(true).notNull(),
  conditions: jsonb("conditions").$type<RuleConditions>().notNull(),
  actions: jsonb("actions").$type<RuleActions>().notNull(),
  hitCount: integer("hit_count").default(0).notNull(),
  lastHitAt: timestamp("last_hit_at"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("bank_rules_org_position_idx").on(table.organizationId, table.position)]);

/** Connexions de flux bancaire (identifiants scellés AES-GCM, jamais renvoyés en clair). */
export const bankFeedConnections = pgTable("bank_feed_connections", {
  id: id(),
  organizationId: org(),
  provider: text("provider", { enum: FEED_PROVIDERS }).default("gocardless").notNull(),
  bankAccountId: text("bank_account_id").references(() => bankAccounts.id, { onDelete: "cascade" }),
  sealedCredentials: text("sealed_credentials").notNull(),
  credentialsHint: text("credentials_hint"),
  institutionId: text("institution_id"),
  requisitionId: text("requisition_id"),
  externalAccountId: text("external_account_id"),
  status: text("status", { enum: FEED_STATUSES }).default("pending").notNull(),
  expiresAt: timestamp("expires_at"),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncedDate: date("last_synced_date", { mode: "string" }),
  lastError: text("last_error"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("bank_feed_connections_org_idx").on(table.organizationId)]);

/** Versements Stripe et leur ventilation (rapprochés contre la ligne de banque nette). */
export const bankPayouts = pgTable("bank_payouts", {
  id: id(),
  organizationId: org(),
  provider: text("provider").default("stripe").notNull(),
  externalId: text("external_id").notNull(),
  status: text("status", { enum: PAYOUT_STATUSES }).notNull(),
  arrivalDate: date("arrival_date", { mode: "string" }).notNull(),
  currency: text("currency").notNull(),
  amountMinor: minor("amount_minor").notNull(),
  grossMinor: minor("gross_minor").default(0).notNull(),
  refundMinor: minor("refund_minor").default(0).notNull(),
  feeMinor: minor("fee_minor").default(0).notNull(),
  adjustmentMinor: minor("adjustment_minor").default(0).notNull(),
  reconciliationId: text("reconciliation_id").references(() => bankReconciliations.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("bank_payouts_org_external_uidx").on(sql`coalesce(${table.organizationId}, '')`, table.provider, table.externalId)]);

export const bankPayoutItems = pgTable("bank_payout_items", {
  id: id(),
  payoutId: text("payout_id").notNull().references(() => bankPayouts.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  type: text("type", { enum: PAYOUT_ITEM_TYPES }).notNull(),
  amountMinor: minor("amount_minor").notNull(),
  feeMinor: minor("fee_minor").default(0).notNull(),
  netMinor: minor("net_minor").notNull(),
  sourceId: text("source_id"),
  paymentId: text("payment_id"),
}, (table) => [uniqueIndex("bank_payout_items_payout_external_uidx").on(table.payoutId, table.externalId)]);
