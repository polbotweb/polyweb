-- Extension du module achats (factures, rapprochement, réassort, retours, SEPA, e-facture, approbations).
CREATE TABLE "approval_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"module" text NOT NULL,
	"resource_type" text NOT NULL,
	"mode" text DEFAULT 'none' NOT NULL,
	"threshold_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_bands" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"level" integer NOT NULL,
	"min_minor" bigint NOT NULL,
	"max_minor" bigint,
	"required_role" text DEFAULT 'orgAdmin' NOT NULL,
	"required_permission" text
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"module" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"policy_id" text,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"requested_by" text,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"level" integer NOT NULL,
	"required_role" text NOT NULL,
	"required_permission" text,
	"status" text DEFAULT 'WAITING' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "purchasing_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"reorder_mode" text DEFAULT 'suggestions' NOT NULL,
	"reorder_hour" integer DEFAULT 6 NOT NULL,
	"reorder_include_reservations" boolean DEFAULT false NOT NULL,
	"reorder_auto_send_trusted_only" boolean DEFAULT true NOT NULL,
	"matching_mode" text DEFAULT 'three_way' NOT NULL,
	"tolerance_absolute_minor" bigint DEFAULT 100 NOT NULL,
	"tolerance_percent" numeric(7, 4) DEFAULT '1' NOT NULL,
	"matching_policy" text DEFAULT 'allow_with_acceptance' NOT NULL,
	"default_tax_category" text DEFAULT 'standard' NOT NULL,
	"default_payment_term_days" integer DEFAULT 30 NOT NULL,
	"default_currency" text DEFAULT 'EUR' NOT NULL,
	"quality_control_required" boolean DEFAULT false NOT NULL,
	"allow_service_lines" boolean DEFAULT true NOT NULL,
	"allow_multi_warehouse" boolean DEFAULT true NOT NULL,
	"po_prefix" text DEFAULT 'BC' NOT NULL,
	"receipt_prefix" text DEFAULT 'BR' NOT NULL,
	"invoice_prefix" text DEFAULT 'FF' NOT NULL,
	"credit_prefix" text DEFAULT 'AF' NOT NULL,
	"return_prefix" text DEFAULT 'RF' NOT NULL,
	"sepa_prefix" text DEFAULT 'SEPA' NOT NULL,
	"debtor_name" text,
	"debtor_iban" text,
	"debtor_bic" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_email_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"locale" text NOT NULL,
	"purpose" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" ADD COLUMN "crm_company_id" text;--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" ADD COLUMN "crm_contact_id" text;--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" ADD COLUMN "iban" text;--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" ADD COLUMN "bic" text;--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" ADD COLUMN "sepa_name" text;--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" ADD COLUMN "trusted_catalogue" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" ADD COLUMN "punchout_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" ADD COLUMN "punchout_setup_url" text;--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" ADD COLUMN "punchout_identity" text;--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" ADD COLUMN "punchout_domain" text;--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" ADD COLUMN "punchout_secret" text;--> statement-breakpoint
ALTER TABLE "purchasing_orders" ADD COLUMN "tax_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchasing_orders" ADD COLUMN "gross_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchasing_orders" ADD COLUMN "approval_request_id" text;--> statement-breakpoint
ALTER TABLE "purchasing_orders" ADD COLUMN "origin" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
UPDATE "purchasing_orders" SET "gross_minor" = "net_minor" WHERE "gross_minor" = 0 AND "net_minor" <> 0;--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" ALTER COLUMN "item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" ADD COLUMN "kind" text DEFAULT 'stock' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" ADD COLUMN "warehouse_id" text;--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" ADD COLUMN "tax_category" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" ADD COLUMN "rate_percent" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" ADD COLUMN "tax_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" ADD COLUMN "gross_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "purchasing_order_lines" SET "gross_minor" = "net_minor" WHERE "gross_minor" = 0 AND "net_minor" <> 0;--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" ADD CONSTRAINT "purchasing_order_lines_kind_item_ck" CHECK ("kind" <> 'stock' OR "item_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE TABLE "purchasing_supplier_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"organization_id" text,
	"first_name" text,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"crm_contact_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_supplier_items" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"organization_id" text,
	"item_id" text,
	"supplier_sku" text,
	"description" text,
	"unit_price_minor" bigint NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"lead_time_days" integer DEFAULT 0 NOT NULL,
	"min_order_qty" integer DEFAULT 1 NOT NULL,
	"pack_qty" integer DEFAULT 1 NOT NULL,
	"preferred" boolean DEFAULT false NOT NULL,
	"valid_from" timestamp,
	"valid_to" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchasing_supplier_items_price_ck" CHECK ("unit_price_minor" >= 0),
	CONSTRAINT "purchasing_supplier_items_qty_ck" CHECK ("min_order_qty" > 0 AND "pack_qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchasing_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"kind" text DEFAULT 'invoice' NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"number" text,
	"supplier_invoice_number" text,
	"supplier_id" text NOT NULL,
	"source_invoice_id" text,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"base_currency" text,
	"exchange_rate" text,
	"exchange_rate_date" text,
	"net_base_minor" bigint,
	"tax_base_minor" bigint,
	"gross_base_minor" bigint,
	"issue_date" text,
	"due_date" text,
	"payment_term_days" integer DEFAULT 30 NOT NULL,
	"net_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"gross_minor" bigint DEFAULT 0 NOT NULL,
	"paid_minor" bigint DEFAULT 0 NOT NULL,
	"credited_minor" bigint DEFAULT 0 NOT NULL,
	"match_status" text DEFAULT 'unmatched' NOT NULL,
	"storage_key" text,
	"import_id" text,
	"order_id" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_invoice_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"position" integer NOT NULL,
	"kind" text DEFAULT 'stock' NOT NULL,
	"item_id" text,
	"sku" text,
	"description" text,
	"quantity" integer NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"tax_category" text DEFAULT 'standard' NOT NULL,
	"rate_percent" numeric(7, 4) DEFAULT '0' NOT NULL,
	"net_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"order_line_id" text,
	"receipt_line_id" text,
	"match_status" text DEFAULT 'unmatched' NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "purchasing_invoice_lines_qty_ck" CHECK ("quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchasing_invoice_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_invoice_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"organization_id" text,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"method" text DEFAULT 'bank_transfer' NOT NULL,
	"paid_at" text NOT NULL,
	"reference" text,
	"sepa_export_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_reorder_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"item_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"min_qty" integer NOT NULL,
	"max_qty" integer NOT NULL,
	"pack_qty" integer DEFAULT 1 NOT NULL,
	"preferred_supplier_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchasing_reorder_rules_qty_ck" CHECK ("min_qty" >= 0 AND "max_qty" >= "min_qty" AND "pack_qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchasing_reorder_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"rule_id" text,
	"item_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"supplier_id" text,
	"on_hand" integer NOT NULL,
	"outstanding" integer NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"suggested_qty" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"order_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_returns" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"number" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"supplier_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"order_id" text,
	"invoice_id" text,
	"reason" text DEFAULT 'other' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_return_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"return_id" text NOT NULL,
	"receipt_line_id" text,
	"item_id" text,
	"sku" text NOT NULL,
	"quantity" integer NOT NULL,
	"movement_id" text,
	"reason" text,
	CONSTRAINT "purchasing_return_lines_qty_ck" CHECK ("quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchasing_quality_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"receipt_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"checked_by" text,
	"checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_quality_check_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"check_id" text NOT NULL,
	"receipt_line_id" text NOT NULL,
	"accepted" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"result" text DEFAULT 'pending' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "purchasing_landed_costs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"order_id" text NOT NULL,
	"invoice_id" text,
	"category" text DEFAULT 'freight' NOT NULL,
	"method" text DEFAULT 'value' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"allocated" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_landed_cost_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"landed_cost_id" text NOT NULL,
	"order_line_id" text NOT NULL,
	"amount_minor" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_einvoice_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"filename" text NOT NULL,
	"format" text NOT NULL,
	"status" text DEFAULT 'parsed' NOT NULL,
	"error" text,
	"supplier_id" text,
	"invoice_id" text,
	"storage_key" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_sepa_exports" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"number" text NOT NULL,
	"status" text DEFAULT 'EXPORTED' NOT NULL,
	"payment_count" integer NOT NULL,
	"total_minor" bigint NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"requested_execution_date" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_punchout_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"supplier_id" text NOT NULL,
	"buyer_cookie" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"hook_url" text,
	"order_id" text,
	"expires_at" timestamp NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_bands" ADD CONSTRAINT "approval_bands_policy_id_approval_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."approval_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_policy_id_approval_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."approval_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_request_id_approval_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."approval_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_settings" ADD CONSTRAINT "purchasing_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_settings" ADD CONSTRAINT "purchasing_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_email_templates" ADD CONSTRAINT "purchasing_email_templates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" ADD CONSTRAINT "purchasing_suppliers_crm_company_id_crm_companies_id_fk" FOREIGN KEY ("crm_company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" ADD CONSTRAINT "purchasing_suppliers_crm_contact_id_crm_contacts_id_fk" FOREIGN KEY ("crm_contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_orders" ADD CONSTRAINT "purchasing_orders_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" ADD CONSTRAINT "purchasing_order_lines_warehouse_id_logistics_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."logistics_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_supplier_contacts" ADD CONSTRAINT "purchasing_supplier_contacts_supplier_id_purchasing_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."purchasing_suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_supplier_contacts" ADD CONSTRAINT "purchasing_supplier_contacts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_supplier_contacts" ADD CONSTRAINT "purchasing_supplier_contacts_crm_contact_id_crm_contacts_id_fk" FOREIGN KEY ("crm_contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_supplier_items" ADD CONSTRAINT "purchasing_supplier_items_supplier_id_purchasing_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."purchasing_suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_supplier_items" ADD CONSTRAINT "purchasing_supplier_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_supplier_items" ADD CONSTRAINT "purchasing_supplier_items_item_id_logistics_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."logistics_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ADD CONSTRAINT "purchasing_invoices_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ADD CONSTRAINT "purchasing_invoices_supplier_id_purchasing_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."purchasing_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ADD CONSTRAINT "purchasing_invoices_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoice_lines" ADD CONSTRAINT "purchasing_invoice_lines_invoice_id_purchasing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchasing_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoice_lines" ADD CONSTRAINT "purchasing_invoice_lines_item_id_logistics_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."logistics_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoice_lines" ADD CONSTRAINT "purchasing_invoice_lines_order_line_id_purchasing_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."purchasing_order_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoice_lines" ADD CONSTRAINT "purchasing_invoice_lines_receipt_line_id_purchasing_receipt_lines_id_fk" FOREIGN KEY ("receipt_line_id") REFERENCES "public"."purchasing_receipt_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoice_revisions" ADD CONSTRAINT "purchasing_invoice_revisions_resource_id_purchasing_invoices_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."purchasing_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoice_revisions" ADD CONSTRAINT "purchasing_invoice_revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoice_locks" ADD CONSTRAINT "purchasing_invoice_locks_resource_id_purchasing_invoices_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."purchasing_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoice_locks" ADD CONSTRAINT "purchasing_invoice_locks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_payments" ADD CONSTRAINT "purchasing_payments_invoice_id_purchasing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchasing_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_payments" ADD CONSTRAINT "purchasing_payments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_payments" ADD CONSTRAINT "purchasing_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_reorder_rules" ADD CONSTRAINT "purchasing_reorder_rules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_reorder_rules" ADD CONSTRAINT "purchasing_reorder_rules_item_id_logistics_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."logistics_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_reorder_rules" ADD CONSTRAINT "purchasing_reorder_rules_warehouse_id_logistics_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."logistics_warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_reorder_rules" ADD CONSTRAINT "purchasing_reorder_rules_preferred_supplier_id_purchasing_suppliers_id_fk" FOREIGN KEY ("preferred_supplier_id") REFERENCES "public"."purchasing_suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_reorder_suggestions" ADD CONSTRAINT "purchasing_reorder_suggestions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_reorder_suggestions" ADD CONSTRAINT "purchasing_reorder_suggestions_rule_id_purchasing_reorder_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."purchasing_reorder_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_reorder_suggestions" ADD CONSTRAINT "purchasing_reorder_suggestions_item_id_logistics_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."logistics_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_reorder_suggestions" ADD CONSTRAINT "purchasing_reorder_suggestions_warehouse_id_logistics_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."logistics_warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_reorder_suggestions" ADD CONSTRAINT "purchasing_reorder_suggestions_supplier_id_purchasing_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."purchasing_suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_reorder_suggestions" ADD CONSTRAINT "purchasing_reorder_suggestions_order_id_purchasing_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchasing_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_returns" ADD CONSTRAINT "purchasing_returns_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_returns" ADD CONSTRAINT "purchasing_returns_supplier_id_purchasing_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."purchasing_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_returns" ADD CONSTRAINT "purchasing_returns_warehouse_id_logistics_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."logistics_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_returns" ADD CONSTRAINT "purchasing_returns_order_id_purchasing_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchasing_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_returns" ADD CONSTRAINT "purchasing_returns_invoice_id_purchasing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchasing_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_returns" ADD CONSTRAINT "purchasing_returns_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_return_lines" ADD CONSTRAINT "purchasing_return_lines_return_id_purchasing_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."purchasing_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_return_lines" ADD CONSTRAINT "purchasing_return_lines_receipt_line_id_purchasing_receipt_lines_id_fk" FOREIGN KEY ("receipt_line_id") REFERENCES "public"."purchasing_receipt_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_return_lines" ADD CONSTRAINT "purchasing_return_lines_item_id_logistics_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."logistics_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_quality_checks" ADD CONSTRAINT "purchasing_quality_checks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_quality_checks" ADD CONSTRAINT "purchasing_quality_checks_receipt_id_purchasing_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."purchasing_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_quality_checks" ADD CONSTRAINT "purchasing_quality_checks_checked_by_user_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_quality_check_lines" ADD CONSTRAINT "purchasing_quality_check_lines_check_id_purchasing_quality_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."purchasing_quality_checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_quality_check_lines" ADD CONSTRAINT "purchasing_quality_check_lines_receipt_line_id_purchasing_receipt_lines_id_fk" FOREIGN KEY ("receipt_line_id") REFERENCES "public"."purchasing_receipt_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_landed_costs" ADD CONSTRAINT "purchasing_landed_costs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_landed_costs" ADD CONSTRAINT "purchasing_landed_costs_order_id_purchasing_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchasing_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_landed_costs" ADD CONSTRAINT "purchasing_landed_costs_invoice_id_purchasing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchasing_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_landed_costs" ADD CONSTRAINT "purchasing_landed_costs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_landed_cost_lines" ADD CONSTRAINT "purchasing_landed_cost_lines_landed_cost_id_purchasing_landed_costs_id_fk" FOREIGN KEY ("landed_cost_id") REFERENCES "public"."purchasing_landed_costs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_landed_cost_lines" ADD CONSTRAINT "purchasing_landed_cost_lines_order_line_id_purchasing_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."purchasing_order_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_einvoice_imports" ADD CONSTRAINT "purchasing_einvoice_imports_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_einvoice_imports" ADD CONSTRAINT "purchasing_einvoice_imports_supplier_id_purchasing_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."purchasing_suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_einvoice_imports" ADD CONSTRAINT "purchasing_einvoice_imports_invoice_id_purchasing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchasing_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_einvoice_imports" ADD CONSTRAINT "purchasing_einvoice_imports_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_sepa_exports" ADD CONSTRAINT "purchasing_sepa_exports_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_sepa_exports" ADD CONSTRAINT "purchasing_sepa_exports_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_punchout_sessions" ADD CONSTRAINT "purchasing_punchout_sessions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_punchout_sessions" ADD CONSTRAINT "purchasing_punchout_sessions_supplier_id_purchasing_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."purchasing_suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_punchout_sessions" ADD CONSTRAINT "purchasing_punchout_sessions_order_id_purchasing_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchasing_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_punchout_sessions" ADD CONSTRAINT "purchasing_punchout_sessions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_policies_org_resource_uidx" ON "approval_policies" USING btree (coalesce("organization_id", ''), "module", "resource_type");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_bands_policy_level_uidx" ON "approval_bands" USING btree ("policy_id","level");--> statement-breakpoint
CREATE INDEX "approval_requests_resource_idx" ON "approval_requests" USING btree ("module","resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "approval_requests_org_status_idx" ON "approval_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_steps_request_level_uidx" ON "approval_steps" USING btree ("request_id","level");--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_settings_org_uidx" ON "purchasing_settings" USING btree (coalesce("organization_id", ''));--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_email_templates_uidx" ON "purchasing_email_templates" USING btree (coalesce("organization_id", ''), "locale", "purpose");--> statement-breakpoint
CREATE INDEX "purchasing_supplier_contacts_supplier_idx" ON "purchasing_supplier_contacts" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchasing_supplier_items_supplier_idx" ON "purchasing_supplier_items" USING btree ("supplier_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_invoices_org_slug_uidx" ON "purchasing_invoices" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_invoices_org_kind_number_uidx" ON "purchasing_invoices" USING btree (coalesce("organization_id", ''), "kind", "number") WHERE "number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_invoices_supplier_number_uidx" ON "purchasing_invoices" USING btree ("supplier_id","supplier_invoice_number") WHERE "supplier_invoice_number" is not null;--> statement-breakpoint
CREATE INDEX "purchasing_invoices_org_status_idx" ON "purchasing_invoices" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_invoice_lines_pos_uidx" ON "purchasing_invoice_lines" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE INDEX "purchasing_invoice_revisions_resource_idx" ON "purchasing_invoice_revisions" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_invoice_locks_resource_id_unique" ON "purchasing_invoice_locks" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "purchasing_payments_invoice_idx" ON "purchasing_payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_reorder_rules_item_wh_uidx" ON "purchasing_reorder_rules" USING btree (coalesce("organization_id", ''), "item_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "purchasing_reorder_suggestions_org_idx" ON "purchasing_reorder_suggestions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_returns_org_slug_uidx" ON "purchasing_returns" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_returns_org_number_uidx" ON "purchasing_returns" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_quality_checks_receipt_uidx" ON "purchasing_quality_checks" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "purchasing_landed_costs_order_idx" ON "purchasing_landed_costs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "purchasing_einvoice_imports_org_idx" ON "purchasing_einvoice_imports" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_sepa_exports_org_number_uidx" ON "purchasing_sepa_exports" USING btree (coalesce("organization_id", ''), "number");--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_punchout_sessions_cookie_uidx" ON "purchasing_punchout_sessions" USING btree ("buyer_cookie");--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" ALTER CONSTRAINT "purchasing_order_lines_warehouse_id_logistics_warehouses_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ALTER CONSTRAINT "purchasing_invoices_supplier_id_purchasing_suppliers_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "purchasing_returns" ALTER CONSTRAINT "purchasing_returns_supplier_id_purchasing_suppliers_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "purchasing_returns" ALTER CONSTRAINT "purchasing_returns_warehouse_id_logistics_warehouses_id_fk" DEFERRABLE INITIALLY DEFERRED;

--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ADD CONSTRAINT "purchasing_invoices_order_id_purchasing_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchasing_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchasing_invoices_order_idx" ON "purchasing_invoices" USING btree ("order_id");
