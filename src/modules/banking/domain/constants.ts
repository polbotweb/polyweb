/**
 * Constantes du domaine banking (sans import serveur : partagées par le schéma, les services,
 * les pages d'administration et les tests).
 */
export const STATEMENT_FORMATS = ["camt053", "camt052", "camt054", "mt940", "mt942", "cfonb120", "ofx", "qif", "csv"] as const;
export type StatementFormat = (typeof STATEMENT_FORMATS)[number];

export const STATEMENT_KINDS = ["statement", "intraday", "notification"] as const;
export type StatementKind = (typeof STATEMENT_KINDS)[number];

export const IMPORT_STATUSES = ["PROCESSED", "FAILED"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const IMPORT_SOURCES = ["upload", "api", "feed"] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const CONTINUITY_STATUSES = ["ok", "gap", "mismatch", "unknown"] as const;
export type ContinuityStatus = (typeof CONTINUITY_STATUSES)[number];

/** État d'une ligne de relevé. */
export const TRANSACTION_STATUSES = ["unmatched", "suggested", "partial", "reconciled", "ignored"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const AUTOMATION_MODES = ["off", "suggest", "auto_exact", "auto_threshold"] as const;
export type AutomationMode = (typeof AUTOMATION_MODES)[number];

export const OVERPAYMENT_TREATMENTS = ["suspense", "customer_advance", "refund_proposal"] as const;
export type OverpaymentTreatment = (typeof OVERPAYMENT_TREATMENTS)[number];

export const RECONCILIATION_STATUSES = ["applied", "pending_approval", "rejected", "reversed"] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export const RECONCILIATION_MODES = ["manual", "auto", "rule"] as const;
export type ReconciliationMode = (typeof RECONCILIATION_MODES)[number];

/** Nature d'une écriture du grand livre banque. */
export const LEDGER_KINDS = ["fee", "write_off", "discount", "fx", "transfer", "rule", "overpayment", "payout_fee", "manual", "reversal"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** Ajustement d'un écart au rapprochement. */
export const ADJUSTMENT_KINDS = ["write_off", "discount", "fee", "fx", "overpayment"] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

export const RULE_DIRECTIONS = ["any", "in", "out"] as const;
export type RuleDirection = (typeof RULE_DIRECTIONS)[number];

/** Opérateurs de libellé (pas d'expression régulière libre : aucun ReDoS possible). */
export const LABEL_OPERATORS = ["contains", "starts_with", "ends_with", "equals"] as const;
export type LabelOperator = (typeof LABEL_OPERATORS)[number];

export const RULE_ACTIONS = ["ledger", "fee", "transfer", "ignore"] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

export const CSV_DATE_FORMATS = ["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY", "DD.MM.YYYY", "DD-MM-YYYY", "YYYYMMDD"] as const;
export type CsvDateFormat = (typeof CSV_DATE_FORMATS)[number];

export const CSV_ENCODINGS = ["utf-8", "windows-1252", "iso-8859-15"] as const;
export type CsvEncoding = (typeof CSV_ENCODINGS)[number];

export const CSV_AMOUNT_MODES = ["signed", "debit_credit"] as const;
export type CsvAmountMode = (typeof CSV_AMOUNT_MODES)[number];

/** Colonnes mappables d'un profil CSV (valeur = index 0-based ou nom d'en-tête). */
export const CSV_FIELDS = ["bookingDate", "valueDate", "amount", "debit", "credit", "label", "reference", "counterpartyName", "counterpartyIban", "currency", "balance", "bankCode"] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

export const FEED_PROVIDERS = ["gocardless"] as const;
export type FeedProvider = (typeof FEED_PROVIDERS)[number];

export const FEED_STATUSES = ["pending", "linked", "expired", "error", "disabled"] as const;
export type FeedStatus = (typeof FEED_STATUSES)[number];

export const PAYOUT_STATUSES = ["pending", "in_transit", "paid", "failed", "canceled", "reconciled"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const PAYOUT_ITEM_TYPES = ["charge", "refund", "fee", "adjustment", "other"] as const;
export type PayoutItemType = (typeof PAYOUT_ITEM_TYPES)[number];

export const ACCOUNT_STATUSES = ["active", "archived"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Rôles d'organisation destinataires des notifications (réglable). */
export const NOTIFY_ROLES = ["owner", "admin", "member"] as const;
export type NotifyRole = (typeof NOTIFY_ROLES)[number];
