CREATE TABLE "attribute_definition_translations" (
	"definition_id" text NOT NULL,
	"locale" text NOT NULL,
	"label" varchar(120) NOT NULL,
	"description" text,
	CONSTRAINT "attribute_definition_translations_pkey" PRIMARY KEY("definition_id","locale")
);
--> statement-breakpoint
CREATE TABLE "attribute_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"module" varchar(40) NOT NULL,
	"owner_type" varchar(40) NOT NULL,
	"owner_id" text NOT NULL,
	"key" varchar(64) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"filterable" boolean DEFAULT true NOT NULL,
	"unit" varchar(24),
	"min_value" double precision,
	"max_value" double precision,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attribute_definitions_kind_check" CHECK ("attribute_definitions"."kind" IN ('text', 'number', 'integer', 'boolean', 'select', 'multiselect', 'date')),
	CONSTRAINT "attribute_definitions_key_check" CHECK ("attribute_definitions"."key" ~ '^[a-z][a-z0-9_]{0,63}$')
);
--> statement-breakpoint
CREATE TABLE "attribute_option_translations" (
	"option_id" text NOT NULL,
	"locale" text NOT NULL,
	"label" varchar(120) NOT NULL,
	CONSTRAINT "attribute_option_translations_pkey" PRIMARY KEY("option_id","locale")
);
--> statement-breakpoint
CREATE TABLE "attribute_options" (
	"id" text PRIMARY KEY NOT NULL,
	"definition_id" text NOT NULL,
	"key" varchar(64) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "attribute_options_key_check" CHECK ("attribute_options"."key" ~ '^[a-z0-9][a-z0-9_]{0,63}$')
);
--> statement-breakpoint
CREATE TABLE "attribute_value_options" (
	"definition_id" text NOT NULL,
	"resource_type" varchar(40) NOT NULL,
	"resource_id" text NOT NULL,
	"option_id" text NOT NULL,
	CONSTRAINT "attribute_value_options_pkey" PRIMARY KEY("definition_id","resource_type","resource_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "attribute_values" (
	"definition_id" text NOT NULL,
	"resource_type" varchar(40) NOT NULL,
	"resource_id" text NOT NULL,
	"text_value" text,
	"number_value" double precision,
	"boolean_value" boolean,
	"date_value" date,
	"option_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attribute_values_pkey" PRIMARY KEY("definition_id","resource_type","resource_id")
);
--> statement-breakpoint
CREATE TABLE "classified_ad_media" (
	"ad_id" text NOT NULL,
	"media_id" text NOT NULL,
	"alt_text" varchar(200) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "classified_ad_media_pkey" PRIMARY KEY("ad_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "classified_ads" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"organization_id" text,
	"author_id" text,
	"category_id" text NOT NULL,
	"slug" varchar(120) NOT NULL,
	"title" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"body_html" text NOT NULL,
	"kind" varchar(12) DEFAULT 'offer' NOT NULL,
	"condition" varchar(12) DEFAULT 'n_a' NOT NULL,
	"price_kind" varchar(16) DEFAULT 'fixed' NOT NULL,
	"price_minor" integer,
	"currency" varchar(3),
	"city" varchar(120) NOT NULL,
	"postal_code" varchar(20),
	"country" varchar(2),
	"cover_image_id" text,
	"lifecycle" varchar(16) DEFAULT 'draft' NOT NULL,
	"moderation_status" varchar(12) DEFAULT 'visible' NOT NULL,
	"expires_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"renewed_at" timestamp with time zone,
	"renew_count" integer DEFAULT 0 NOT NULL,
	"sold_at" timestamp with time zone,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, coalesce("title", '') || ' ' || coalesce("body", '') || ' ' || coalesce("city", ''))) STORED,
	CONSTRAINT "classified_ads_kind_check" CHECK ("classified_ads"."kind" IN ('offer', 'wanted')),
	CONSTRAINT "classified_ads_condition_check" CHECK ("classified_ads"."condition" IN ('new', 'used', 'n_a')),
	CONSTRAINT "classified_ads_price_kind_check" CHECK ("classified_ads"."price_kind" IN ('fixed', 'free', 'on_request')),
	CONSTRAINT "classified_ads_lifecycle_check" CHECK ("classified_ads"."lifecycle" IN ('draft', 'pending', 'published', 'expired', 'sold', 'archived')),
	CONSTRAINT "classified_ads_moderation_check" CHECK ("classified_ads"."moderation_status" IN ('visible', 'hidden', 'spam')),
	CONSTRAINT "classified_ads_price_non_negative" CHECK ("classified_ads"."price_minor" IS NULL OR "classified_ads"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "classified_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"parent_id" text,
	"slug" varchar(80) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classified_category_translations" (
	"category_id" text NOT NULL,
	"locale" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	CONSTRAINT "classified_category_translations_pkey" PRIMARY KEY("category_id","locale")
);
--> statement-breakpoint
CREATE TABLE "classified_favorites" (
	"ad_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classified_favorites_pkey" PRIMARY KEY("ad_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "classified_inquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"ad_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"buyer_id" text NOT NULL,
	"seller_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classified_saved_search_filters" (
	"search_id" text NOT NULL,
	"definition_key" varchar(64) NOT NULL,
	"text_value" text,
	"number_min" integer,
	"number_max" integer,
	"boolean_value" boolean,
	"option_key" varchar(64),
	CONSTRAINT "classified_saved_search_filters_pkey" PRIMARY KEY("search_id","definition_key")
);
--> statement-breakpoint
CREATE TABLE "classified_saved_searches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"site_id" text NOT NULL,
	"name" varchar(120),
	"query" varchar(200),
	"category_id" text,
	"kind" varchar(12),
	"condition" varchar(12),
	"price_min_minor" integer,
	"price_max_minor" integer,
	"currency" varchar(3),
	"city" varchar(120),
	"postal_code" varchar(20),
	"notify" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classified_site_settings" (
	"site_id" text PRIMARY KEY NOT NULL,
	"visibility" varchar(16) DEFAULT 'public' NOT NULL,
	"pre_moderation" boolean DEFAULT true NOT NULL,
	"duration_days" integer DEFAULT 30 NOT NULL,
	"default_currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"max_images" integer DEFAULT 8 NOT NULL,
	"max_renewals" integer DEFAULT 3 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classified_site_settings_visibility" CHECK ("classified_site_settings"."visibility" IN ('public', 'members', 'org')),
	CONSTRAINT "classified_site_settings_bounds" CHECK ("classified_site_settings"."duration_days" BETWEEN 7 AND 90 AND "classified_site_settings"."max_images" BETWEEN 1 AND 8 AND "classified_site_settings"."max_renewals" BETWEEN 0 AND 20)
);
--> statement-breakpoint
ALTER TABLE "attribute_definition_translations" ADD CONSTRAINT "attribute_definition_translations_definition_id_attribute_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_option_translations" ADD CONSTRAINT "attribute_option_translations_option_id_attribute_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."attribute_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_options" ADD CONSTRAINT "attribute_options_definition_id_attribute_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_value_options" ADD CONSTRAINT "attribute_value_options_definition_id_attribute_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_value_options" ADD CONSTRAINT "attribute_value_options_option_id_attribute_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."attribute_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_definition_id_attribute_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_option_id_attribute_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."attribute_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_ad_media" ADD CONSTRAINT "classified_ad_media_ad_id_classified_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."classified_ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_ad_media" ADD CONSTRAINT "classified_ad_media_media_id_media_files_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_ads" ADD CONSTRAINT "classified_ads_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_ads" ADD CONSTRAINT "classified_ads_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_ads" ADD CONSTRAINT "classified_ads_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_ads" ADD CONSTRAINT "classified_ads_category_id_classified_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."classified_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_ads" ADD CONSTRAINT "classified_ads_cover_image_id_media_files_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_categories" ADD CONSTRAINT "classified_categories_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_categories" ADD CONSTRAINT "classified_categories_parent_id_classified_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."classified_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_category_translations" ADD CONSTRAINT "classified_category_translations_category_id_classified_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."classified_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_favorites" ADD CONSTRAINT "classified_favorites_ad_id_classified_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."classified_ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_favorites" ADD CONSTRAINT "classified_favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_inquiries" ADD CONSTRAINT "classified_inquiries_ad_id_classified_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."classified_ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_inquiries" ADD CONSTRAINT "classified_inquiries_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_inquiries" ADD CONSTRAINT "classified_inquiries_buyer_id_user_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_inquiries" ADD CONSTRAINT "classified_inquiries_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_saved_search_filters" ADD CONSTRAINT "classified_saved_search_filters_search_id_classified_saved_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."classified_saved_searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_saved_searches" ADD CONSTRAINT "classified_saved_searches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_saved_searches" ADD CONSTRAINT "classified_saved_searches_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_saved_searches" ADD CONSTRAINT "classified_saved_searches_category_id_classified_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."classified_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_site_settings" ADD CONSTRAINT "classified_site_settings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_site_settings" ADD CONSTRAINT "classified_site_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_definitions_owner_key_uidx" ON "attribute_definitions" USING btree ("module","owner_type","owner_id","key");--> statement-breakpoint
CREATE INDEX "attribute_definitions_owner_idx" ON "attribute_definitions" USING btree ("module","owner_type","owner_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_options_definition_key_uidx" ON "attribute_options" USING btree ("definition_id","key");--> statement-breakpoint
CREATE INDEX "attribute_options_order_idx" ON "attribute_options" USING btree ("definition_id","position");--> statement-breakpoint
CREATE INDEX "attribute_value_options_resource_idx" ON "attribute_value_options" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "attribute_values_resource_idx" ON "attribute_values" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "attribute_values_option_idx" ON "attribute_values" USING btree ("option_id");--> statement-breakpoint
CREATE INDEX "classified_ad_media_ad_idx" ON "classified_ad_media" USING btree ("ad_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "classified_ads_site_slug_uidx" ON "classified_ads" USING btree ("site_id","slug");--> statement-breakpoint
CREATE INDEX "classified_ads_list_idx" ON "classified_ads" USING btree ("site_id","lifecycle","moderation_status","published_at");--> statement-breakpoint
CREATE INDEX "classified_ads_category_idx" ON "classified_ads" USING btree ("category_id","lifecycle","moderation_status");--> statement-breakpoint
CREATE INDEX "classified_ads_author_idx" ON "classified_ads" USING btree ("author_id","site_id","lifecycle");--> statement-breakpoint
CREATE INDEX "classified_ads_expires_idx" ON "classified_ads" USING btree ("lifecycle","expires_at");--> statement-breakpoint
CREATE INDEX "classified_ads_search_idx" ON "classified_ads" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "classified_categories_site_slug_uidx" ON "classified_categories" USING btree ("site_id","slug");--> statement-breakpoint
CREATE INDEX "classified_categories_parent_idx" ON "classified_categories" USING btree ("site_id","parent_id","position");--> statement-breakpoint
CREATE INDEX "classified_favorites_user_idx" ON "classified_favorites" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "classified_inquiries_ad_buyer_uidx" ON "classified_inquiries" USING btree ("ad_id","buyer_id");--> statement-breakpoint
CREATE INDEX "classified_inquiries_conversation_idx" ON "classified_inquiries" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "classified_saved_searches_user_idx" ON "classified_saved_searches" USING btree ("user_id","site_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION classifieds_cascade_ad() RETURNS trigger AS $$
BEGIN
  DELETE FROM attribute_value_options WHERE resource_type = 'classifieds.ad' AND resource_id = OLD.id;
  DELETE FROM attribute_values WHERE resource_type = 'classifieds.ad' AND resource_id = OLD.id;
  DELETE FROM moderation_reports WHERE module = 'classifieds' AND target_type = 'ad' AND target_id = OLD.id;
  DELETE FROM moderation_actions WHERE module = 'classifieds' AND target_type = 'ad' AND target_id = OLD.id;
  RETURN OLD;
END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS classified_ads_cascade ON classified_ads;
--> statement-breakpoint
CREATE TRIGGER classified_ads_cascade AFTER DELETE ON classified_ads FOR EACH ROW EXECUTE FUNCTION classifieds_cascade_ad();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION classifieds_cascade_category() RETURNS trigger AS $$
BEGIN
  DELETE FROM attribute_definitions WHERE module = 'classifieds' AND owner_type = 'category' AND owner_id = OLD.id;
  RETURN OLD;
END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS classified_categories_cascade ON classified_categories;
--> statement-breakpoint
CREATE TRIGGER classified_categories_cascade AFTER DELETE ON classified_categories FOR EACH ROW EXECUTE FUNCTION classifieds_cascade_category();
