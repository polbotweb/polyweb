CREATE TABLE "purchasing_sepa_export_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"export_id" text NOT NULL,
	"organization_id" text,
	"invoice_id" text NOT NULL,
	"end_to_end_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_id" text,
	"return_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"role_codes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"journals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lettering_enabled" boolean DEFAULT true NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"label" text NOT NULL,
	"iban" text,
	"bic" text,
	"account_number" text,
	"bank_name" text,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"ledger_account" text DEFAULT '512000' NOT NULL,
	"journal_code" text DEFAULT 'BQ' NOT NULL,
	"journal_label" text DEFAULT 'Banque' NOT NULL,
	"opening_balance_minor" bigint,
	"opening_balance_date" date,
	"default_format" text,
	"csv_profile_id" text,
	"automation_mode" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_closing_balance_minor" bigint,
	"last_closing_date" date,
	"last_sequence" text,
	"continuity_status" text DEFAULT 'unknown' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_csv_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"name" text NOT NULL,
	"profile" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_feed_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"provider" text DEFAULT 'gocardless' NOT NULL,
	"bank_account_id" text,
	"sealed_credentials" text NOT NULL,
	"credentials_hint" text,
	"institution_id" text,
	"requisition_id" text,
	"external_account_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp,
	"last_sync_at" timestamp,
	"last_synced_date" date,
	"last_error" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"bank_account_id" text NOT NULL,
	"source" text DEFAULT 'upload' NOT NULL,
	"format" text NOT NULL,
	"status" text NOT NULL,
	"file_name" text,
	"storage_key" text,
	"sha256" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"statement_count" integer DEFAULT 0 NOT NULL,
	"line_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"merged_count" integer DEFAULT 0 NOT NULL,
	"auto_matched_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"bank_account_id" text,
	"reconciliation_id" text,
	"transaction_id" text,
	"reversal_of_id" text,
	"kind" text NOT NULL,
	"date" date NOT NULL,
	"journal_code" text NOT NULL,
	"journal_label" text NOT NULL,
	"piece_ref" text NOT NULL,
	"label" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_ledger_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"position" integer NOT NULL,
	"account" text NOT NULL,
	"account_label" text NOT NULL,
	"aux_account" text,
	"aux_label" text,
	"label" text NOT NULL,
	"debit_minor" bigint DEFAULT 0 NOT NULL,
	"credit_minor" bigint DEFAULT 0 NOT NULL,
	"foreign_minor" bigint,
	"foreign_currency" text,
	"lettering" text,
	"lettering_date" date
);
--> statement-breakpoint
CREATE TABLE "bank_payout_items" (
	"id" text PRIMARY KEY NOT NULL,
	"payout_id" text NOT NULL,
	"external_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"fee_minor" bigint DEFAULT 0 NOT NULL,
	"net_minor" bigint NOT NULL,
	"source_id" text,
	"payment_id" text
);
--> statement-breakpoint
CREATE TABLE "bank_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"external_id" text NOT NULL,
	"status" text NOT NULL,
	"arrival_date" date NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"gross_minor" bigint DEFAULT 0 NOT NULL,
	"refund_minor" bigint DEFAULT 0 NOT NULL,
	"fee_minor" bigint DEFAULT 0 NOT NULL,
	"adjustment_minor" bigint DEFAULT 0 NOT NULL,
	"reconciliation_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_reconciliation_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"reconciliation_id" text NOT NULL,
	"source" text NOT NULL,
	"target_id" text NOT NULL,
	"reference" text,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"effects" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_reconciliation_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"reconciliation_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"amount_minor" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_reconciliations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"status" text NOT NULL,
	"mode" text DEFAULT 'manual' NOT NULL,
	"score" integer,
	"lettering_code" text,
	"date" date NOT NULL,
	"currency" text NOT NULL,
	"bank_total_minor" bigint NOT NULL,
	"allocated_minor" bigint NOT NULL,
	"adjustment_minor" bigint DEFAULT 0 NOT NULL,
	"approval_request_id" text,
	"plan" jsonb,
	"note" text,
	"rule_id" text,
	"created_by" text,
	"reversed_by" text,
	"reversed_at" timestamp,
	"reversal_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"name" text NOT NULL,
	"position" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"conditions" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"last_hit_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_statements" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"bank_account_id" text NOT NULL,
	"import_id" text NOT NULL,
	"kind" text DEFAULT 'statement' NOT NULL,
	"external_id" text,
	"sequence" text,
	"from_date" date,
	"to_date" date,
	"opening_balance_minor" bigint,
	"closing_balance_minor" bigint,
	"currency" text NOT NULL,
	"line_count" integer DEFAULT 0 NOT NULL,
	"continuity_status" text DEFAULT 'unknown' NOT NULL,
	"continuity_delta_minor" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"bank_account_id" text NOT NULL,
	"statement_id" text,
	"fingerprint" text NOT NULL,
	"booking_date" date NOT NULL,
	"value_date" date,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"original_amount_minor" bigint,
	"original_currency" text,
	"base_amount_minor" bigint,
	"base_rate" text,
	"label" text NOT NULL,
	"counterparty_name" text,
	"counterparty_iban" text,
	"end_to_end_id" text,
	"bank_reference" text,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bank_code" text,
	"return_reason" text,
	"provisional" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'unmatched' NOT NULL,
	"matched_minor" bigint DEFAULT 0 NOT NULL,
	"suggestion" jsonb,
	"rule_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "lettering_code" text;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "lettering_date" date;--> statement-breakpoint
ALTER TABLE "sales_payments" ADD COLUMN "bank_account_id" text;--> statement-breakpoint
ALTER TABLE "sales_payments" ADD COLUMN "reconciliation_id" text;--> statement-breakpoint
ALTER TABLE "sales_payments" ADD COLUMN "lettering_code" text;--> statement-breakpoint
ALTER TABLE "sales_payments" ADD COLUMN "lettering_date" date;--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ADD COLUMN "lettering_code" text;--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ADD COLUMN "lettering_date" text;--> statement-breakpoint
ALTER TABLE "purchasing_payments" ADD COLUMN "bank_account_id" text;--> statement-breakpoint
ALTER TABLE "purchasing_payments" ADD COLUMN "reconciliation_id" text;--> statement-breakpoint
ALTER TABLE "purchasing_payments" ADD COLUMN "lettering_code" text;--> statement-breakpoint
ALTER TABLE "purchasing_payments" ADD COLUMN "lettering_date" text;--> statement-breakpoint
ALTER TABLE "purchasing_sepa_exports" ADD COLUMN "executed_at" timestamp;--> statement-breakpoint
ALTER TABLE "purchasing_sepa_exports" ADD COLUMN "bank_account_id" text;--> statement-breakpoint
ALTER TABLE "purchasing_sepa_export_lines" ADD CONSTRAINT "purchasing_sepa_export_lines_export_id_purchasing_sepa_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."purchasing_sepa_exports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_sepa_export_lines" ADD CONSTRAINT "purchasing_sepa_export_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_sepa_export_lines" ADD CONSTRAINT "purchasing_sepa_export_lines_invoice_id_purchasing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchasing_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_accounts" ADD CONSTRAINT "accounting_accounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_accounts" ADD CONSTRAINT "accounting_accounts_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_settings" ADD CONSTRAINT "accounting_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_settings" ADD CONSTRAINT "accounting_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_csv_profile_id_bank_csv_profiles_id_fk" FOREIGN KEY ("csv_profile_id") REFERENCES "public"."bank_csv_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_csv_profiles" ADD CONSTRAINT "bank_csv_profiles_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_csv_profiles" ADD CONSTRAINT "bank_csv_profiles_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_feed_connections" ADD CONSTRAINT "bank_feed_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_feed_connections" ADD CONSTRAINT "bank_feed_connections_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_feed_connections" ADD CONSTRAINT "bank_feed_connections_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_imports" ADD CONSTRAINT "bank_imports_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_imports" ADD CONSTRAINT "bank_imports_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_imports" ADD CONSTRAINT "bank_imports_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_ledger_entries" ADD CONSTRAINT "bank_ledger_entries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_ledger_entries" ADD CONSTRAINT "bank_ledger_entries_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_ledger_entries" ADD CONSTRAINT "bank_ledger_entries_reconciliation_id_bank_reconciliations_id_fk" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."bank_reconciliations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_ledger_entries" ADD CONSTRAINT "bank_ledger_entries_transaction_id_bank_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_ledger_entries" ADD CONSTRAINT "bank_ledger_entries_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_ledger_lines" ADD CONSTRAINT "bank_ledger_lines_entry_id_bank_ledger_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."bank_ledger_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_payout_items" ADD CONSTRAINT "bank_payout_items_payout_id_bank_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."bank_payouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_payouts" ADD CONSTRAINT "bank_payouts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_payouts" ADD CONSTRAINT "bank_payouts_reconciliation_id_bank_reconciliations_id_fk" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."bank_reconciliations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliation_allocations" ADD CONSTRAINT "bank_reconciliation_allocations_reconciliation_id_bank_reconciliations_id_fk" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."bank_reconciliations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliation_lines" ADD CONSTRAINT "bank_reconciliation_lines_reconciliation_id_bank_reconciliations_id_fk" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."bank_reconciliations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliation_lines" ADD CONSTRAINT "bank_reconciliation_lines_transaction_id_bank_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_reversed_by_user_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_rules" ADD CONSTRAINT "bank_rules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_rules" ADD CONSTRAINT "bank_rules_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_settings" ADD CONSTRAINT "bank_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_settings" ADD CONSTRAINT "bank_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_import_id_bank_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."bank_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_statement_id_bank_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."bank_statements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchasing_sepa_export_lines_export_idx" ON "purchasing_sepa_export_lines" USING btree ("export_id");--> statement-breakpoint
CREATE INDEX "purchasing_sepa_export_lines_e2e_idx" ON "purchasing_sepa_export_lines" USING btree ("organization_id","end_to_end_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_accounts_org_code_uidx" ON "accounting_accounts" USING btree (coalesce("organization_id", ''),"code");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_settings_org_uidx" ON "accounting_settings" USING btree (coalesce("organization_id", ''));--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_org_iban_uidx" ON "bank_accounts" USING btree (coalesce("organization_id", ''),"iban") WHERE "bank_accounts"."iban" is not null;--> statement-breakpoint
CREATE INDEX "bank_accounts_org_idx" ON "bank_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_csv_profiles_org_name_uidx" ON "bank_csv_profiles" USING btree (coalesce("organization_id", ''),"name");--> statement-breakpoint
CREATE INDEX "bank_feed_connections_org_idx" ON "bank_feed_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_imports_account_sha_uidx" ON "bank_imports" USING btree ("bank_account_id","sha256");--> statement-breakpoint
CREATE INDEX "bank_imports_org_created_idx" ON "bank_imports" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "bank_ledger_entries_org_date_idx" ON "bank_ledger_entries" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "bank_ledger_lines_entry_idx" ON "bank_ledger_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_payout_items_payout_external_uidx" ON "bank_payout_items" USING btree ("payout_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_payouts_org_external_uidx" ON "bank_payouts" USING btree (coalesce("organization_id", ''),"provider","external_id");--> statement-breakpoint
CREATE INDEX "bank_reconciliation_allocations_rec_idx" ON "bank_reconciliation_allocations" USING btree ("reconciliation_id");--> statement-breakpoint
CREATE INDEX "bank_reconciliation_allocations_target_idx" ON "bank_reconciliation_allocations" USING btree ("source","target_id");--> statement-breakpoint
CREATE INDEX "bank_reconciliation_lines_rec_idx" ON "bank_reconciliation_lines" USING btree ("reconciliation_id");--> statement-breakpoint
CREATE INDEX "bank_reconciliation_lines_tx_idx" ON "bank_reconciliation_lines" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "bank_reconciliations_org_status_idx" ON "bank_reconciliations" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "bank_rules_org_position_idx" ON "bank_rules" USING btree ("organization_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_settings_org_uidx" ON "bank_settings" USING btree (coalesce("organization_id", ''));--> statement-breakpoint
CREATE INDEX "bank_statements_account_to_idx" ON "bank_statements" USING btree ("bank_account_id","to_date");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_transactions_account_fp_uidx" ON "bank_transactions" USING btree ("bank_account_id","fingerprint");--> statement-breakpoint
CREATE INDEX "bank_transactions_org_account_date_idx" ON "bank_transactions" USING btree ("organization_id","bank_account_id","booking_date");--> statement-breakpoint
CREATE INDEX "bank_transactions_org_status_idx" ON "bank_transactions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "sales_payments_reconciliation_idx" ON "sales_payments" USING btree ("reconciliation_id");--> statement-breakpoint
CREATE INDEX "purchasing_payments_reconciliation_idx" ON "purchasing_payments" USING btree ("reconciliation_id");