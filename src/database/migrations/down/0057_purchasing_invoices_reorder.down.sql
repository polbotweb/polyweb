-- Lignes de prestation (hors stock, item_id nul) : le schéma d'origine impose item_id NOT NULL.
-- On les retire avant tout ALTER sur purchasing_order_lines, avec les contraintes rendues
-- immédiates, pour éviter l'erreur 55006 (événements de déclencheur en attente) dans une
-- même transaction. Perte volontaire de ces lignes à la descente, par conception.
SET CONSTRAINTS ALL IMMEDIATE;
--> statement-breakpoint
DELETE FROM "purchasing_receipt_lines" WHERE "order_line_id" IN (
  SELECT "id" FROM "purchasing_order_lines" WHERE "item_id" IS NULL OR "kind" IS DISTINCT FROM 'stock'
);
--> statement-breakpoint
DELETE FROM "purchasing_order_lines" WHERE "item_id" IS NULL OR "kind" IS DISTINCT FROM 'stock';
--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" DROP CONSTRAINT IF EXISTS "purchasing_order_lines_kind_item_ck";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_punchout_sessions";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_sepa_exports";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_einvoice_imports";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_landed_cost_lines";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_landed_costs";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_quality_check_lines";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_quality_checks";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_return_lines";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_returns";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_reorder_suggestions";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_reorder_rules";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_payments";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_invoice_locks";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_invoice_revisions";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_invoice_lines";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_invoices";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_supplier_items";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_supplier_contacts";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_email_templates";
--> statement-breakpoint
DROP TABLE IF EXISTS "purchasing_settings";
--> statement-breakpoint
ALTER TABLE "email_outbox" DROP COLUMN IF EXISTS "attachments";
--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" DROP COLUMN IF EXISTS "kind";
--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" DROP COLUMN IF EXISTS "warehouse_id";
--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" DROP COLUMN IF EXISTS "tax_category";
--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" DROP COLUMN IF EXISTS "rate_percent";
--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" DROP COLUMN IF EXISTS "tax_minor";
--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" DROP COLUMN IF EXISTS "gross_minor";
--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" ALTER COLUMN "item_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchasing_orders" DROP COLUMN IF EXISTS "tax_minor";
--> statement-breakpoint
ALTER TABLE "purchasing_orders" DROP COLUMN IF EXISTS "gross_minor";
--> statement-breakpoint
ALTER TABLE "purchasing_orders" DROP COLUMN IF EXISTS "approval_request_id";
--> statement-breakpoint
ALTER TABLE "purchasing_orders" DROP COLUMN IF EXISTS "origin";
--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" DROP COLUMN IF EXISTS "crm_company_id";
--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" DROP COLUMN IF EXISTS "crm_contact_id";
--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" DROP COLUMN IF EXISTS "iban";
--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" DROP COLUMN IF EXISTS "bic";
--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" DROP COLUMN IF EXISTS "sepa_name";
--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" DROP COLUMN IF EXISTS "trusted_catalogue";
--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" DROP COLUMN IF EXISTS "punchout_enabled";
--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" DROP COLUMN IF EXISTS "punchout_setup_url";
--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" DROP COLUMN IF EXISTS "punchout_identity";
--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" DROP COLUMN IF EXISTS "punchout_domain";
--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" DROP COLUMN IF EXISTS "punchout_secret";
--> statement-breakpoint
DROP TABLE IF EXISTS "approval_steps";
--> statement-breakpoint
DROP TABLE IF EXISTS "approval_requests";
--> statement-breakpoint
DROP TABLE IF EXISTS "approval_bands";
--> statement-breakpoint
DROP TABLE IF EXISTS "approval_policies";
