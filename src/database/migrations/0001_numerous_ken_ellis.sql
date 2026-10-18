CREATE TABLE "blog_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"parent_id" text,
	"slug" text NOT NULL,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blog_categories_no_self_parent" CHECK ("blog_categories"."parent_id" IS NULL OR "blog_categories"."parent_id" != "blog_categories"."id")
);
--> statement-breakpoint
CREATE TABLE "blog_category_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"meta_title" text,
	"meta_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_comment_moderations" (
	"id" text PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"moderator_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"previous_values" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"author_id" text,
	"parent_id" text,
	"guest_name" text,
	"guest_email" text,
	"content" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"karma" integer DEFAULT 0 NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"is_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"post_id" text,
	"comment_id" text,
	"review_id" text,
	"from_user_id" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blog_notifications_single_target" CHECK ((
        ("blog_notifications"."post_id" IS NOT NULL)::int +
        ("blog_notifications"."comment_id" IS NOT NULL)::int +
        ("blog_notifications"."review_id" IS NOT NULL)::int
      ) = 1)
);
--> statement-breakpoint
CREATE TABLE "blog_post_categories" (
	"post_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "blog_post_categories_post_id_category_id_pk" PRIMARY KEY("post_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "blog_post_favorites" (
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blog_post_favorites_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "blog_post_galleries" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"title" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_post_gallery_media" (
	"gallery_id" text NOT NULL,
	"media_id" text NOT NULL,
	"alt_text" text NOT NULL,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "blog_post_gallery_media_gallery_id_media_id_pk" PRIMARY KEY("gallery_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "blog_post_links" (
	"id" text PRIMARY KEY NOT NULL,
	"source_post_id" text NOT NULL,
	"target_post_id" text NOT NULL,
	"link_type" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_post_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "blog_post_locks_post_id_unique" UNIQUE("post_id")
);
--> statement-breakpoint
CREATE TABLE "blog_post_reactions" (
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reaction_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blog_post_reactions_post_id_user_id_reaction_type_pk" PRIMARY KEY("post_id","user_id","reaction_type")
);
--> statement-breakpoint
CREATE TABLE "blog_post_review_helpful" (
	"review_id" text NOT NULL,
	"user_id" text NOT NULL,
	"is_helpful" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blog_post_review_helpful_review_id_user_id_pk" PRIMARY KEY("review_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "blog_post_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"author_id" text,
	"rating" integer NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"is_recommended" boolean DEFAULT true NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_post_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
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
CREATE TABLE "blog_post_seo" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"locale" text NOT NULL,
	"focus_keyword" text,
	"focus_keyword_score" integer,
	"readability_score" integer,
	"meta_robots" text DEFAULT 'index,follow',
	"meta_og_type" text DEFAULT 'article',
	"meta_og_locale" text,
	"meta_twitter_card" text DEFAULT 'summary_large_image',
	"schema_markup" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_post_tags" (
	"post_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "blog_post_tags_post_id_tag_id_pk" PRIMARY KEY("post_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "blog_post_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"content" text NOT NULL,
	"excerpt" text,
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
CREATE TABLE "blog_post_view_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"viewed_at" timestamp DEFAULT now() NOT NULL,
	"date" text NOT NULL,
	"hour" integer NOT NULL,
	"referrer" text,
	"country" varchar(2),
	"device_type" text,
	"session_id" text
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"author_id" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"featured_image_id" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_sticky" boolean DEFAULT false NOT NULL,
	"comment_status" text DEFAULT 'OPEN' NOT NULL,
	"allow_reviews" boolean DEFAULT true NOT NULL,
	"seo_score" integer,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text,
	"locked_by" text,
	"locked_at" timestamp,
	CONSTRAINT "blog_posts_publish_consistency" CHECK (NOT "blog_posts"."status" = 'PUBLISHED' OR "blog_posts"."published_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "blog_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text,
	"comment_id" text,
	"review_id" text,
	"reporter_id" text,
	"reason" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blog_reports_single_target" CHECK ((
        ("blog_reports"."post_id" IS NOT NULL)::int +
        ("blog_reports"."comment_id" IS NOT NULL)::int +
        ("blog_reports"."review_id" IS NOT NULL)::int
      ) = 1)
);
--> statement-breakpoint
CREATE TABLE "blog_tag_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"tag_id" text NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"slug" text NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blog_categories" ADD CONSTRAINT "blog_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_categories" ADD CONSTRAINT "blog_categories_parent_id_blog_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."blog_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_category_translations" ADD CONSTRAINT "blog_category_translations_category_id_blog_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."blog_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_comment_moderations" ADD CONSTRAINT "blog_comment_moderations_comment_id_blog_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."blog_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_comment_moderations" ADD CONSTRAINT "blog_comment_moderations_moderator_id_user_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_parent_id_blog_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."blog_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_notifications" ADD CONSTRAINT "blog_notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_notifications" ADD CONSTRAINT "blog_notifications_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_notifications" ADD CONSTRAINT "blog_notifications_comment_id_blog_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."blog_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_notifications" ADD CONSTRAINT "blog_notifications_review_id_blog_post_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."blog_post_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_notifications" ADD CONSTRAINT "blog_notifications_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_categories" ADD CONSTRAINT "blog_post_categories_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_categories" ADD CONSTRAINT "blog_post_categories_category_id_blog_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."blog_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_favorites" ADD CONSTRAINT "blog_post_favorites_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_favorites" ADD CONSTRAINT "blog_post_favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_galleries" ADD CONSTRAINT "blog_post_galleries_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_gallery_media" ADD CONSTRAINT "blog_post_gallery_media_gallery_id_blog_post_galleries_id_fk" FOREIGN KEY ("gallery_id") REFERENCES "public"."blog_post_galleries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_gallery_media" ADD CONSTRAINT "blog_post_gallery_media_media_id_media_files_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_links" ADD CONSTRAINT "blog_post_links_source_post_id_blog_posts_id_fk" FOREIGN KEY ("source_post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_links" ADD CONSTRAINT "blog_post_links_target_post_id_blog_posts_id_fk" FOREIGN KEY ("target_post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_locks" ADD CONSTRAINT "blog_post_locks_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_locks" ADD CONSTRAINT "blog_post_locks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_reactions" ADD CONSTRAINT "blog_post_reactions_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_reactions" ADD CONSTRAINT "blog_post_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_review_helpful" ADD CONSTRAINT "blog_post_review_helpful_review_id_blog_post_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."blog_post_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_review_helpful" ADD CONSTRAINT "blog_post_review_helpful_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_reviews" ADD CONSTRAINT "blog_post_reviews_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_reviews" ADD CONSTRAINT "blog_post_reviews_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_revisions" ADD CONSTRAINT "blog_post_revisions_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_revisions" ADD CONSTRAINT "blog_post_revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_seo" ADD CONSTRAINT "blog_post_seo_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_tags" ADD CONSTRAINT "blog_post_tags_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_tags" ADD CONSTRAINT "blog_post_tags_tag_id_blog_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."blog_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_translations" ADD CONSTRAINT "blog_post_translations_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_translations" ADD CONSTRAINT "blog_post_translations_og_image_id_media_files_id_fk" FOREIGN KEY ("og_image_id") REFERENCES "public"."media_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_view_stats" ADD CONSTRAINT "blog_post_view_stats_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_featured_image_id_media_files_id_fk" FOREIGN KEY ("featured_image_id") REFERENCES "public"."media_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_locked_by_user_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_reports" ADD CONSTRAINT "blog_reports_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_reports" ADD CONSTRAINT "blog_reports_comment_id_blog_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."blog_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_reports" ADD CONSTRAINT "blog_reports_review_id_blog_post_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."blog_post_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_reports" ADD CONSTRAINT "blog_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_reports" ADD CONSTRAINT "blog_reports_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_tag_translations" ADD CONSTRAINT "blog_tag_translations_tag_id_blog_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."blog_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_tags" ADD CONSTRAINT "blog_tags_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blog_categories_org_slug_uidx" ON "blog_categories" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "blog_categories_org_idx" ON "blog_categories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "blog_categories_parent_idx" ON "blog_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_category_translations_cat_locale_uidx" ON "blog_category_translations" USING btree ("category_id","locale");--> statement-breakpoint
CREATE INDEX "blog_comment_moderations_comment_idx" ON "blog_comment_moderations" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "blog_comment_moderations_moderator_idx" ON "blog_comment_moderations" USING btree ("moderator_id");--> statement-breakpoint
CREATE INDEX "blog_comments_post_idx" ON "blog_comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "blog_comments_parent_idx" ON "blog_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "blog_comments_status_idx" ON "blog_comments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blog_comments_author_idx" ON "blog_comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "blog_comments_created_idx" ON "blog_comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "blog_notifications_user_idx" ON "blog_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "blog_notifications_read_idx" ON "blog_notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "blog_notifications_type_idx" ON "blog_notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "blog_notifications_created_idx" ON "blog_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "blog_post_galleries_post_idx" ON "blog_post_galleries" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_post_links_unique_idx" ON "blog_post_links" USING btree ("source_post_id","target_post_id","link_type");--> statement-breakpoint
CREATE INDEX "blog_post_links_source_idx" ON "blog_post_links" USING btree ("source_post_id");--> statement-breakpoint
CREATE INDEX "blog_post_links_target_idx" ON "blog_post_links" USING btree ("target_post_id");--> statement-breakpoint
CREATE INDEX "blog_post_locks_expires_idx" ON "blog_post_locks" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "blog_post_reviews_post_idx" ON "blog_post_reviews" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "blog_post_reviews_author_idx" ON "blog_post_reviews" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "blog_post_reviews_rating_idx" ON "blog_post_reviews" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "blog_post_reviews_status_idx" ON "blog_post_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blog_post_revisions_post_idx" ON "blog_post_revisions" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "blog_post_revisions_author_idx" ON "blog_post_revisions" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_post_seo_post_locale_uidx" ON "blog_post_seo" USING btree ("post_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_post_translations_post_locale_uidx" ON "blog_post_translations" USING btree ("post_id","locale");--> statement-breakpoint
CREATE INDEX "blog_post_translations_locale_slug_idx" ON "blog_post_translations" USING btree ("locale","slug");--> statement-breakpoint
CREATE INDEX "blog_post_view_stats_post_idx" ON "blog_post_view_stats" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "blog_post_view_stats_date_idx" ON "blog_post_view_stats" USING btree ("date");--> statement-breakpoint
CREATE INDEX "blog_post_view_stats_post_date_idx" ON "blog_post_view_stats" USING btree ("post_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_posts_org_slug_uidx" ON "blog_posts" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "blog_posts_org_idx" ON "blog_posts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "blog_posts_author_idx" ON "blog_posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "blog_posts_status_idx" ON "blog_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blog_posts_published_at_idx" ON "blog_posts" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "blog_posts_featured_idx" ON "blog_posts" USING btree ("organization_id","is_featured","status");--> statement-breakpoint
CREATE INDEX "blog_posts_sticky_idx" ON "blog_posts" USING btree ("organization_id","is_sticky","status");--> statement-breakpoint
CREATE INDEX "blog_reports_status_idx" ON "blog_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blog_reports_reporter_idx" ON "blog_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_tag_translations_tag_locale_uidx" ON "blog_tag_translations" USING btree ("tag_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_tags_org_slug_uidx" ON "blog_tags" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "blog_tags_org_idx" ON "blog_tags" USING btree ("organization_id");