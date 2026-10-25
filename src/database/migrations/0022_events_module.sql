CREATE TABLE "event_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"organization_id" text,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"excerpt" text,
	"content" text DEFAULT '' NOT NULL,
	"venue_name" text,
	"venue_address" text,
	"meta_title" text,
	"meta_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"timezone" text,
	"capacity" integer,
	"price_minor" integer,
	"currency" varchar(3),
	"cover_image_id" text,
	"published_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "events_dates_order" CHECK ("events"."ends_at" IS NULL OR "events"."starts_at" IS NULL OR "events"."ends_at" >= "events"."starts_at"),
	CONSTRAINT "events_capacity_positive" CHECK ("events"."capacity" IS NULL OR "events"."capacity" > 0),
	CONSTRAINT "events_price_non_negative" CHECK ("events"."price_minor" IS NULL OR "events"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "events_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "events_locks_resource_id_unique" UNIQUE("resource_id")
);
--> statement-breakpoint
CREATE TABLE "events_revisions" (
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
ALTER TABLE "event_translations" ADD CONSTRAINT "event_translations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_translations" ADD CONSTRAINT "event_translations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_cover_image_id_media_files_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events_locks" ADD CONSTRAINT "events_locks_resource_id_events_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events_locks" ADD CONSTRAINT "events_locks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events_revisions" ADD CONSTRAINT "events_revisions_resource_id_events_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events_revisions" ADD CONSTRAINT "events_revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_translations_event_locale_uidx" ON "event_translations" USING btree ("event_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "event_translations_org_locale_slug_uidx" ON "event_translations" USING btree ("organization_id","locale","slug") WHERE "event_translations"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_translations_global_locale_slug_uidx" ON "event_translations" USING btree ("locale","slug") WHERE "event_translations"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "events_org_slug_uidx" ON "events" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "events_org_idx" ON "events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "events_status_starts_idx" ON "events" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "events_revisions_resource_idx" ON "events_revisions" USING btree ("resource_id");