CREATE TABLE "exchange_rate_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"base_currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"locked_at" timestamp,
	"last_fetched_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rate_settings_org_uq" UNIQUE NULLS NOT DISTINCT("organization_id")
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"base_currency" varchar(3) NOT NULL,
	"quote_currency" varchar(3) NOT NULL,
	"rate_date" date NOT NULL,
	"rate" text NOT NULL,
	"source" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_pair_day_source_uq" UNIQUE NULLS NOT DISTINCT("organization_id","base_currency","quote_currency","rate_date","source"),
	CONSTRAINT "exchange_rates_rate_ck" CHECK ("exchange_rates"."rate" ~ '^[0-9]+(\.[0-9]+)?$' and "exchange_rates"."rate" !~ '^0+(\.0+)?$'),
	CONSTRAINT "exchange_rates_pair_ck" CHECK ("exchange_rates"."base_currency" <> "exchange_rates"."quote_currency"),
	CONSTRAINT "exchange_rates_source_ck" CHECK ("exchange_rates"."source" in ('ecb', 'manual'))
);
--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "base_currency" text;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "exchange_rate" text;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "exchange_rate_date" date;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "net_base_minor" bigint;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "tax_base_minor" bigint;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "gross_base_minor" bigint;--> statement-breakpoint
ALTER TABLE "exchange_rate_settings" ADD CONSTRAINT "exchange_rate_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_rates_lookup_idx" ON "exchange_rates" USING btree ("base_currency","quote_currency","rate_date");