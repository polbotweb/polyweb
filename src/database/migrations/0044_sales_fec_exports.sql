CREATE TABLE "sales_fec_exports" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"period" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"filename" text,
	"storage_key" text,
	"size_bytes" integer,
	"sha256" text,
	"entry_count" integer,
	"line_count" integer,
	"debit_minor" bigint,
	"credit_minor" bigint,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"generated_by" text,
	"attempted_at" timestamp DEFAULT now() NOT NULL,
	"generated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_fec_exports" ADD CONSTRAINT "sales_fec_exports_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_fec_exports" ADD CONSTRAINT "sales_fec_exports_generated_by_user_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_fec_exports_org_period_uidx" ON "sales_fec_exports" USING btree (coalesce("organization_id", ''),"period");--> statement-breakpoint
CREATE INDEX "sales_fec_exports_period_idx" ON "sales_fec_exports" USING btree ("period");