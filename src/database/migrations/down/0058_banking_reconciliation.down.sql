-- Descente de 0058 (banque, rapprochement, plan comptable par organisation) : tables du module
-- banking et de core/accounting, lignes de lots SEPA, colonnes de rapprochement et de lettrage
-- ajoutées aux ventes et aux achats. Perte volontaire de ces données à la descente.
DROP TABLE IF EXISTS "bank_payout_items";
--> statement-breakpoint
DROP TABLE IF EXISTS "bank_payouts";
--> statement-breakpoint
DROP TABLE IF EXISTS "bank_feed_connections";
--> statement-breakpoint
DROP TABLE IF EXISTS "bank_rules";
--> statement-breakpoint
DROP TABLE IF EXISTS "bank_ledger_lines";
--> statement-breakpoint
DROP TABLE IF EXISTS "bank_ledger_entries";
--> statement-breakpoint
DROP TABLE IF EXISTS "bank_reconciliation_allocations";
--> statement-breakpoint
DROP TABLE IF EXISTS "bank_reconciliation_lines";
--> statement-breakpoint
DROP TABLE IF EXISTS "bank_reconciliations";
--> statement-breakpoint
DROP TABLE IF EXISTS "bank_transactions";
--> statement-breakpoint
DROP TABLE IF EXISTS "bank_statements";
--> statement-breakpoint
DROP TABLE IF EXISTS "bank_imports";
--> statement-breakpoint
DROP TABLE IF EXISTS "bank_accounts";
--> statement-breakpoint
DROP TABLE IF EXISTS "bank_csv_profiles";
--> statement-breakpoint
DROP TABLE IF EXISTS "bank_settings";
--> statement-breakpoint
DROP TABLE IF EXISTS "accounting_settings";
--> statement-breakpoint
DROP TABLE IF EXISTS "accounting_accounts";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_sepa_export_lines";
--> statement-breakpoint
DROP INDEX IF EXISTS "sales_payments_reconciliation_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "purchasing_payments_reconciliation_idx";
--> statement-breakpoint
ALTER TABLE "purchasing_sepa_exports" DROP COLUMN IF EXISTS "bank_account_id";
--> statement-breakpoint
ALTER TABLE "purchasing_sepa_exports" DROP COLUMN IF EXISTS "executed_at";
--> statement-breakpoint
ALTER TABLE "purchasing_payments" DROP COLUMN IF EXISTS "lettering_date";
--> statement-breakpoint
ALTER TABLE "purchasing_payments" DROP COLUMN IF EXISTS "lettering_code";
--> statement-breakpoint
ALTER TABLE "purchasing_payments" DROP COLUMN IF EXISTS "reconciliation_id";
--> statement-breakpoint
ALTER TABLE "purchasing_payments" DROP COLUMN IF EXISTS "bank_account_id";
--> statement-breakpoint
ALTER TABLE "purchasing_invoices" DROP COLUMN IF EXISTS "lettering_date";
--> statement-breakpoint
ALTER TABLE "purchasing_invoices" DROP COLUMN IF EXISTS "lettering_code";
--> statement-breakpoint
ALTER TABLE "sales_payments" DROP COLUMN IF EXISTS "lettering_date";
--> statement-breakpoint
ALTER TABLE "sales_payments" DROP COLUMN IF EXISTS "lettering_code";
--> statement-breakpoint
ALTER TABLE "sales_payments" DROP COLUMN IF EXISTS "reconciliation_id";
--> statement-breakpoint
ALTER TABLE "sales_payments" DROP COLUMN IF EXISTS "bank_account_id";
--> statement-breakpoint
ALTER TABLE "sales_documents" DROP COLUMN IF EXISTS "lettering_date";
--> statement-breakpoint
ALTER TABLE "sales_documents" DROP COLUMN IF EXISTS "lettering_code";
--> statement-breakpoint
DELETE FROM "document_sequences" WHERE "key" = 'accounting.lettering';
