CREATE TABLE "content_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"type_id" text NOT NULL,
	"slug" varchar(200) NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"shared_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"author_id" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_entry_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"message" varchar(300),
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_entry_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"locale" varchar(8) NOT NULL,
	"title" varchar(300) NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"blocks" jsonb,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_types" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_locale" varchar(8) DEFAULT 'fr' NOT NULL,
	"locales" jsonb DEFAULT '["fr","en","es","ar"]'::jsonb NOT NULL,
	"organization_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_type_id_content_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."content_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_entry_revisions" ADD CONSTRAINT "content_entry_revisions_entry_id_content_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."content_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_entry_revisions" ADD CONSTRAINT "content_entry_revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_entry_translations" ADD CONSTRAINT "content_entry_translations_entry_id_content_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."content_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_types" ADD CONSTRAINT "content_types_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_entries_type_slug_uidx" ON "content_entries" USING btree ("type_id","slug");--> statement-breakpoint
CREATE INDEX "content_entries_site_status_idx" ON "content_entries" USING btree ("site_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "content_entry_revisions_entry_version_uidx" ON "content_entry_revisions" USING btree ("entry_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "content_entry_translations_entry_locale_uidx" ON "content_entry_translations" USING btree ("entry_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "content_types_site_slug_uidx" ON "content_types" USING btree ("site_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_slug_uidx" ON "sites" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_single_default_uidx" ON "sites" USING btree ("is_default") WHERE "sites"."is_default" = true;--> statement-breakpoint
INSERT INTO "sites" ("id", "slug", "name", "domains", "is_default") VALUES ('00000000-0000-4000-8000-000000000001', 'default', 'Site principal', '[]'::jsonb, true) ON CONFLICT DO NOTHING;
