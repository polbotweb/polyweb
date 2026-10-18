CREATE TABLE IF NOT EXISTS "services" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text,
  "provider_id" text NOT NULL,
  "slug" text NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "cover_image_id" text,
  "price_minor" integer,
  "currency" varchar(3),
  "duration_minutes" integer,
  "max_participants" integer,
  "is_mobile" boolean DEFAULT false NOT NULL,
  "is_featured" boolean DEFAULT false NOT NULL,
  "view_count" integer DEFAULT 0 NOT NULL,
  "rating_average_100" integer DEFAULT 0 NOT NULL,
  "rating_count" integer DEFAULT 0 NOT NULL,
  "seo_score" integer,
  "published_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "updated_by" text,
  "locked_by" text,
  "locked_at" timestamp,
  CONSTRAINT "services_publish_consistency" CHECK (NOT ("status" = 'PUBLISHED') OR "published_at" IS NOT NULL),
  CONSTRAINT "services_price_non_negative" CHECK ("price_minor" IS NULL OR "price_minor" >= 0),
  CONSTRAINT "services_duration_positive" CHECK ("duration_minutes" IS NULL OR "duration_minutes" > 0),
  CONSTRAINT "services_participants_positive" CHECK ("max_participants" IS NULL OR "max_participants" > 0),
  CONSTRAINT "services_rating_average_range" CHECK ("rating_average_100" >= 0 AND "rating_average_100" <= 500)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_translations" (
  "id" text PRIMARY KEY NOT NULL,
  "service_id" text NOT NULL,
  "organization_id" text,
  "locale" text NOT NULL,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "excerpt" text,
  "content" text NOT NULL,
  "location_label" text,
  "location_address" text,
  "meta_title" text,
  "meta_description" text,
  "meta_keywords" text,
  "canonical_url" text,
  "og_title" text,
  "og_description" text,
  "og_image_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_categories" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text,
  "parent_id" text,
  "slug" text NOT NULL,
  "icon" text,
  "color" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "service_categories_no_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" != "id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_category_translations" (
  "id" text PRIMARY KEY NOT NULL,
  "category_id" text NOT NULL,
  "organization_id" text,
  "locale" text NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "meta_title" text,
  "meta_description" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_tags" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text,
  "slug" text NOT NULL,
  "color" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_tag_translations" (
  "id" text PRIMARY KEY NOT NULL,
  "tag_id" text NOT NULL,
  "organization_id" text,
  "locale" text NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_category_links" (
  "service_id" text NOT NULL,
  "category_id" text NOT NULL,
  PRIMARY KEY ("service_id", "category_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_tag_links" (
  "service_id" text NOT NULL,
  "tag_id" text NOT NULL,
  PRIMARY KEY ("service_id", "tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_media" (
  "service_id" text NOT NULL,
  "media_id" text NOT NULL,
  "kind" text DEFAULT 'GALLERY' NOT NULL,
  "alt_text" text NOT NULL,
  "caption" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  PRIMARY KEY ("service_id", "media_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_availability" (
  "id" text PRIMARY KEY NOT NULL,
  "service_id" text NOT NULL,
  "day_of_week" integer NOT NULL,
  "start_time" text NOT NULL,
  "end_time" text NOT NULL,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "max_participants" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "service_availability_day_range" CHECK ("day_of_week" BETWEEN 0 AND 6),
  CONSTRAINT "service_availability_time_order" CHECK ("start_time" < "end_time"),
  CONSTRAINT "service_availability_participants_positive" CHECK ("max_participants" IS NULL OR "max_participants" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_revisions" (
  "id" text PRIMARY KEY NOT NULL,
  "service_id" text NOT NULL,
  "author_id" text NOT NULL,
  "locale" text NOT NULL,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "content" text NOT NULL,
  "excerpt" text,
  "status" text NOT NULL,
  "revision_note" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_locks" (
  "id" text PRIMARY KEY NOT NULL,
  "service_id" text NOT NULL UNIQUE,
  "user_id" text NOT NULL,
  "session_id" text NOT NULL,
  "locked_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL,
  CONSTRAINT "service_locks_expiry_after_lock" CHECK ("expires_at" > "locked_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_seo" (
  "id" text PRIMARY KEY NOT NULL,
  "service_id" text NOT NULL,
  "locale" text NOT NULL,
  "focus_keyword" text,
  "focus_keyword_score" integer,
  "readability_score" integer,
  "meta_robots" text DEFAULT 'index,follow',
  "meta_og_type" text DEFAULT 'service',
  "meta_og_locale" text,
  "schema_markup" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_favorites" (
  "service_id" text NOT NULL,
  "user_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("service_id", "user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_reviews" (
  "id" text PRIMARY KEY NOT NULL,
  "service_id" text NOT NULL,
  "author_id" text,
  "rating" integer NOT NULL,
  "title" text,
  "content" text NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "is_recommended" boolean DEFAULT true NOT NULL,
  "helpful_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "service_reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_review_helpful" (
  "review_id" text NOT NULL,
  "user_id" text NOT NULL,
  "is_helpful" boolean NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("review_id", "user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_comments" (
  "id" text PRIMARY KEY NOT NULL,
  "service_id" text NOT NULL,
  "author_id" text,
  "parent_id" text,
  "content" text NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_reports" (
  "id" text PRIMARY KEY NOT NULL,
  "service_id" text,
  "comment_id" text,
  "review_id" text,
  "reporter_id" text,
  "reason" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "resolved_by" text,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "service_reports_single_target" CHECK ((("service_id" IS NOT NULL)::int + ("comment_id" IS NOT NULL)::int + ("review_id" IS NOT NULL)::int) = 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_view_stats" (
  "id" text PRIMARY KEY NOT NULL,
  "service_id" text NOT NULL,
  "viewed_at" timestamp DEFAULT now() NOT NULL,
  "date" text NOT NULL,
  "hour" integer NOT NULL,
  "referrer" text,
  "country" varchar(2),
  CONSTRAINT "service_view_stats_hour_range" CHECK ("hour" BETWEEN 0 AND 23)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_reactions" (
  "service_id" text NOT NULL,
  "user_id" text NOT NULL,
  "reaction_type" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("service_id", "user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_notifications" (
  "id" text PRIMARY KEY NOT NULL,
  "recipient_id" text NOT NULL,
  "actor_id" text,
  "service_id" text NOT NULL,
  "comment_id" text,
  "review_id" text,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "read_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "service_notification_target_consistency" CHECK (NOT ("type" IN ('NEW_COMMENT','REPLY_TO_COMMENT') AND "comment_id" IS NULL)),
  CONSTRAINT "service_notification_review_target_consistency" CHECK (NOT ("type" IN ('NEW_REVIEW','REVIEW_APPROVED','REVIEW_REJECTED') AND "review_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_attribute_definitions" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "type" text NOT NULL,
  "options" text,
  "required" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_attribute_values" (
  "service_id" text NOT NULL,
  "definition_id" text NOT NULL,
  "string_value" text,
  "number_value" integer,
  "boolean_value" boolean,
  "selected_value" text,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("service_id", "definition_id")
);
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "services" ADD CONSTRAINT "services_provider_id_user_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "services" ADD CONSTRAINT "services_cover_image_id_media_files_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media_files"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "services" ADD CONSTRAINT "services_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "services" ADD CONSTRAINT "services_locked_by_user_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "service_translations" ADD CONSTRAINT "service_translations_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_translations" ADD CONSTRAINT "service_translations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_translations" ADD CONSTRAINT "service_translations_og_image_id_media_files_id_fk" FOREIGN KEY ("og_image_id") REFERENCES "public"."media_files"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_parent_id_service_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."service_categories"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "service_category_translations" ADD CONSTRAINT "service_category_translations_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_category_translations" ADD CONSTRAINT "service_category_translations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_tags" ADD CONSTRAINT "service_tags_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_tag_translations" ADD CONSTRAINT "service_tag_translations_tag_id_service_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."service_tags"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_tag_translations" ADD CONSTRAINT "service_tag_translations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_category_links" ADD CONSTRAINT "service_category_links_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_category_links" ADD CONSTRAINT "service_category_links_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_tag_links" ADD CONSTRAINT "service_tag_links_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_tag_links" ADD CONSTRAINT "service_tag_links_tag_id_service_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."service_tags"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_media" ADD CONSTRAINT "service_media_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_media" ADD CONSTRAINT "service_media_media_id_media_files_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_availability" ADD CONSTRAINT "service_availability_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_revisions" ADD CONSTRAINT "service_revisions_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_revisions" ADD CONSTRAINT "service_revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_locks" ADD CONSTRAINT "service_locks_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_locks" ADD CONSTRAINT "service_locks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_seo" ADD CONSTRAINT "service_seo_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_favorites" ADD CONSTRAINT "service_favorites_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_favorites" ADD CONSTRAINT "service_favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_reviews" ADD CONSTRAINT "service_reviews_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_reviews" ADD CONSTRAINT "service_reviews_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "service_review_helpful" ADD CONSTRAINT "service_review_helpful_review_id_service_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."service_reviews"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_review_helpful" ADD CONSTRAINT "service_review_helpful_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_comments" ADD CONSTRAINT "service_comments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_comments" ADD CONSTRAINT "service_comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "service_comments" ADD CONSTRAINT "service_comments_parent_id_service_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."service_comments"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_comment_id_service_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."service_comments"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_review_id_service_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."service_reviews"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "service_view_stats" ADD CONSTRAINT "service_view_stats_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_reactions" ADD CONSTRAINT "service_reactions_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_reactions" ADD CONSTRAINT "service_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_notifications" ADD CONSTRAINT "service_notifications_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_notifications" ADD CONSTRAINT "service_notifications_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "service_notifications" ADD CONSTRAINT "service_notifications_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_notifications" ADD CONSTRAINT "service_notifications_comment_id_service_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."service_comments"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_notifications" ADD CONSTRAINT "service_notifications_review_id_service_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."service_reviews"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_attribute_definitions" ADD CONSTRAINT "service_attribute_definitions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_attribute_values" ADD CONSTRAINT "service_attribute_values_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_attribute_values" ADD CONSTRAINT "service_attribute_values_definition_id_service_attribute_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."service_attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "services_org_slug_uidx" ON "services" USING btree ("organization_id","slug");
CREATE INDEX "services_org_idx" ON "services" USING btree ("organization_id");
CREATE INDEX "services_provider_idx" ON "services" USING btree ("provider_id");
CREATE INDEX "services_status_idx" ON "services" USING btree ("status");
CREATE INDEX "services_published_at_idx" ON "services" USING btree ("published_at");
CREATE INDEX "services_featured_idx" ON "services" USING btree ("organization_id","is_featured","status");
CREATE UNIQUE INDEX "service_translations_service_locale_uidx" ON "service_translations" USING btree ("service_id","locale");
CREATE UNIQUE INDEX "service_translations_org_locale_slug_uidx" ON "service_translations" USING btree ("organization_id","locale","slug") WHERE "organization_id" IS NOT NULL;
CREATE UNIQUE INDEX "service_translations_global_locale_slug_uidx" ON "service_translations" USING btree ("locale","slug") WHERE "organization_id" IS NULL;
CREATE INDEX "service_translations_locale_slug_idx" ON "service_translations" USING btree ("locale","slug");
CREATE UNIQUE INDEX "service_categories_org_slug_uidx" ON "service_categories" USING btree ("organization_id","slug");
CREATE INDEX "service_categories_org_idx" ON "service_categories" USING btree ("organization_id");
CREATE INDEX "service_categories_parent_idx" ON "service_categories" USING btree ("parent_id");
CREATE UNIQUE INDEX "service_category_translations_category_locale_uidx" ON "service_category_translations" USING btree ("category_id","locale");
CREATE UNIQUE INDEX "service_category_translations_org_locale_slug_uidx" ON "service_category_translations" USING btree ("organization_id","locale","slug") WHERE "organization_id" IS NOT NULL;
CREATE UNIQUE INDEX "service_category_translations_global_locale_slug_uidx" ON "service_category_translations" USING btree ("locale","slug") WHERE "organization_id" IS NULL;
CREATE INDEX "service_category_translations_locale_slug_idx" ON "service_category_translations" USING btree ("locale","slug");
CREATE UNIQUE INDEX "service_tags_org_slug_uidx" ON "service_tags" USING btree ("organization_id","slug");
CREATE INDEX "service_tags_org_idx" ON "service_tags" USING btree ("organization_id");
CREATE INDEX "service_media_service_idx" ON "service_media" USING btree ("service_id");
CREATE INDEX "service_availability_service_idx" ON "service_availability" USING btree ("service_id");
CREATE INDEX "service_revisions_service_idx" ON "service_revisions" USING btree ("service_id");
CREATE INDEX "service_revisions_author_idx" ON "service_revisions" USING btree ("author_id");
CREATE INDEX "service_locks_user_idx" ON "service_locks" USING btree ("user_id");
CREATE UNIQUE INDEX "service_seo_service_locale_uidx" ON "service_seo" USING btree ("service_id","locale");
CREATE UNIQUE INDEX "service_reviews_service_author_uidx" ON "service_reviews" USING btree ("service_id","author_id");
CREATE INDEX "service_reviews_service_idx" ON "service_reviews" USING btree ("service_id");
CREATE INDEX "service_reviews_status_idx" ON "service_reviews" USING btree ("status");
CREATE INDEX "service_comments_service_idx" ON "service_comments" USING btree ("service_id");
CREATE INDEX "service_comments_parent_idx" ON "service_comments" USING btree ("parent_id");
CREATE INDEX "service_comments_status_idx" ON "service_comments" USING btree ("status");
CREATE INDEX "service_reports_status_idx" ON "service_reports" USING btree ("status");
CREATE INDEX "service_reports_reporter_idx" ON "service_reports" USING btree ("reporter_id");
CREATE INDEX "service_view_stats_service_date_idx" ON "service_view_stats" USING btree ("service_id","date");
CREATE INDEX "service_view_stats_viewed_at_idx" ON "service_view_stats" USING btree ("viewed_at");
CREATE INDEX "service_reactions_type_idx" ON "service_reactions" USING btree ("service_id","reaction_type");
CREATE INDEX "service_notifications_recipient_idx" ON "service_notifications" USING btree ("recipient_id","read_at");
CREATE INDEX "service_notifications_service_idx" ON "service_notifications" USING btree ("service_id");
CREATE INDEX "service_notifications_created_idx" ON "service_notifications" USING btree ("created_at");
CREATE UNIQUE INDEX "service_attribute_definitions_org_key_uidx" ON "service_attribute_definitions" USING btree ("organization_id","key");
CREATE INDEX "service_attribute_definitions_org_idx" ON "service_attribute_definitions" USING btree ("organization_id");
CREATE INDEX "service_attribute_values_definition_idx" ON "service_attribute_values" USING btree ("definition_id");
