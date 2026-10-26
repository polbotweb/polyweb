CREATE TABLE "tax_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"country_code" text NOT NULL,
	"category" text DEFAULT 'standard' NOT NULL,
	"customer_type" text,
	"rate_percent" numeric(7, 4) NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rate_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "tax_rate_locks_resource_id_unique" UNIQUE("resource_id")
);
--> statement-breakpoint
CREATE TABLE "tax_rate_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"status" text NOT NULL,
	"country_code" text NOT NULL,
	"category" text NOT NULL,
	"customer_type" text,
	"rate_percent" numeric(7, 4) NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rate_locks" ADD CONSTRAINT "tax_rate_locks_resource_id_tax_rates_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."tax_rates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rate_locks" ADD CONSTRAINT "tax_rate_locks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rate_revisions" ADD CONSTRAINT "tax_rate_revisions_resource_id_tax_rates_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."tax_rates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rate_revisions" ADD CONSTRAINT "tax_rate_revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_org_slug_uidx" ON "tax_rates" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "tax_rates_lookup_idx" ON "tax_rates" USING btree ("organization_id","country_code","category");--> statement-breakpoint
CREATE INDEX "tax_rate_revisions_resource_idx" ON "tax_rate_revisions" USING btree ("resource_id");