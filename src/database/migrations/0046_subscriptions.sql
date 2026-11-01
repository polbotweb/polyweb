CREATE TABLE "subscription_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"parent_id" text,
	"slug" text NOT NULL,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_categories_no_self_parent" CHECK ("subscription_categories"."parent_id" IS NULL OR "subscription_categories"."parent_id" != "subscription_categories"."id")
);
--> statement-breakpoint
CREATE TABLE "subscription_category_links" (
	"plan_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "subscription_category_links_plan_id_category_id_pk" PRIMARY KEY("plan_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_category_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"organization_id" text,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tax_category" text DEFAULT 'standard' NOT NULL,
	"supply_type" text DEFAULT 'services' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"organization_id" text,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"interval" text DEFAULT 'month' NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_prices_amount_positive" CHECK ("subscription_prices"."amount_minor" > 0),
	CONSTRAINT "subscription_prices_interval_count" CHECK ("subscription_prices"."interval_count" between 1 and 12),
	CONSTRAINT "subscription_prices_trial_days" CHECK ("subscription_prices"."trial_days" between 0 and 730)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"plan_id" text NOT NULL,
	"price_id" text NOT NULL,
	"customer_user_id" text,
	"customer_email" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_country" text NOT NULL,
	"customer_type" text DEFAULT 'B2C' NOT NULL,
	"status" text DEFAULT 'incomplete' NOT NULL,
	"provider" text NOT NULL,
	"provider_subscription_id" text,
	"provider_customer_id" text,
	"provider_item_id" text,
	"provider_product_id" text,
	"checkout_session_id" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"current_period_end" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "provider_invoice_id" text;--> statement-breakpoint
ALTER TABLE "subscription_categories" ADD CONSTRAINT "subscription_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_categories" ADD CONSTRAINT "subscription_categories_parent_id_subscription_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."subscription_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_category_links" ADD CONSTRAINT "subscription_category_links_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_category_links" ADD CONSTRAINT "subscription_category_links_category_id_subscription_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."subscription_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_category_translations" ADD CONSTRAINT "subscription_category_translations_category_id_subscription_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."subscription_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_category_translations" ADD CONSTRAINT "subscription_category_translations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_prices" ADD CONSTRAINT "subscription_prices_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_prices" ADD CONSTRAINT "subscription_prices_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_price_id_subscription_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."subscription_prices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_user_id_user_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_categories_org_slug_uidx" ON "subscription_categories" USING btree ("organization_id","slug") WHERE "subscription_categories"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_categories_global_slug_uidx" ON "subscription_categories" USING btree ("slug") WHERE "subscription_categories"."organization_id" IS NULL;--> statement-breakpoint
CREATE INDEX "subscription_categories_org_idx" ON "subscription_categories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscription_categories_parent_idx" ON "subscription_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "subscription_category_links_category_idx" ON "subscription_category_links" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_category_translations_category_locale_uidx" ON "subscription_category_translations" USING btree ("category_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_category_translations_org_locale_slug_uidx" ON "subscription_category_translations" USING btree ("organization_id","locale","slug") WHERE "subscription_category_translations"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_category_translations_global_locale_slug_uidx" ON "subscription_category_translations" USING btree ("locale","slug") WHERE "subscription_category_translations"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plans_org_slug_uidx" ON "subscription_plans" USING btree (coalesce("organization_id", ''),"slug");--> statement-breakpoint
CREATE INDEX "subscription_plans_org_active_idx" ON "subscription_plans" USING btree ("organization_id","active");--> statement-breakpoint
CREATE INDEX "subscription_prices_plan_idx" ON "subscription_prices" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_subscription_uidx" ON "subscriptions" USING btree ("provider","provider_subscription_id") WHERE "subscriptions"."provider_subscription_id" is not null;--> statement-breakpoint
CREATE INDEX "subscriptions_org_status_idx" ON "subscriptions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_user_idx" ON "subscriptions" USING btree ("customer_user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_documents_provider_invoice_uidx" ON "sales_documents" USING btree ("provider_invoice_id") WHERE "sales_documents"."provider_invoice_id" is not null;