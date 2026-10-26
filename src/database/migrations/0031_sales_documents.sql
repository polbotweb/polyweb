CREATE TABLE "sales_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"number" text,
	"source_document_id" text,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_address" text,
	"customer_country" text NOT NULL,
	"customer_type" text DEFAULT 'B2B' NOT NULL,
	"customer_vat_number" text,
	"seller_country" text NOT NULL,
	"supply_type" text DEFAULT 'services' NOT NULL,
	"oss_registered" boolean DEFAULT false NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"issue_date" date,
	"due_date" date,
	"valid_until" date,
	"payment_term_days" integer DEFAULT 30 NOT NULL,
	"net_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"gross_minor" bigint DEFAULT 0 NOT NULL,
	"paid_minor" bigint DEFAULT 0 NOT NULL,
	"credited_minor" bigint DEFAULT 0 NOT NULL,
	"tax_mention" text,
	"reminder_level" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_document_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(13, 4) NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"discount_percent" numeric(7, 4) DEFAULT '0' NOT NULL,
	"tax_category" text DEFAULT 'standard' NOT NULL,
	"rate_percent" numeric(7, 4) DEFAULT '0' NOT NULL,
	"net_minor" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_document_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "sales_document_locks_resource_id_unique" UNIQUE("resource_id")
);
--> statement-breakpoint
CREATE TABLE "sales_document_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"status" text NOT NULL,
	"number" text,
	"gross_minor" bigint NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"organization_id" text,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"method" text DEFAULT 'bank_transfer' NOT NULL,
	"paid_at" date NOT NULL,
	"reference" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"level" integer NOT NULL,
	"days_overdue" integer NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"sent_by" text
);
--> statement-breakpoint
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_source_document_id_sales_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."sales_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_document_lines" ADD CONSTRAINT "sales_document_lines_document_id_sales_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."sales_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_document_locks" ADD CONSTRAINT "sales_document_locks_resource_id_sales_documents_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."sales_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_document_locks" ADD CONSTRAINT "sales_document_locks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_document_revisions" ADD CONSTRAINT "sales_document_revisions_resource_id_sales_documents_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."sales_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_document_revisions" ADD CONSTRAINT "sales_document_revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_payments" ADD CONSTRAINT "sales_payments_document_id_sales_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."sales_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_payments" ADD CONSTRAINT "sales_payments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_payments" ADD CONSTRAINT "sales_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_reminders" ADD CONSTRAINT "sales_reminders_document_id_sales_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."sales_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_reminders" ADD CONSTRAINT "sales_reminders_sent_by_user_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_documents_org_slug_uidx" ON "sales_documents" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_documents_org_kind_number_uidx" ON "sales_documents" USING btree (coalesce("organization_id", ''),"kind","number") WHERE "sales_documents"."number" is not null;--> statement-breakpoint
CREATE INDEX "sales_documents_org_kind_status_idx" ON "sales_documents" USING btree ("organization_id","kind","status");--> statement-breakpoint
CREATE INDEX "sales_documents_source_idx" ON "sales_documents" USING btree ("source_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_document_lines_doc_pos_uidx" ON "sales_document_lines" USING btree ("document_id","position");--> statement-breakpoint
CREATE INDEX "sales_document_revisions_resource_idx" ON "sales_document_revisions" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "sales_payments_document_idx" ON "sales_payments" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_reminders_doc_level_uidx" ON "sales_reminders" USING btree ("document_id","level");