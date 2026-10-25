CREATE TABLE "formation_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"formation_id" text NOT NULL,
	"organization_id" text,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"excerpt" text,
	"content" text DEFAULT '' NOT NULL,
	"objectives" text,
	"prerequisites" text,
	"meta_title" text,
	"meta_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"level" text,
	"duration_hours" integer,
	"price_minor" integer,
	"currency" varchar(3),
	"certificate" boolean DEFAULT false NOT NULL,
	"cover_image_id" text,
	"published_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "formations_duration_positive" CHECK ("formations"."duration_hours" IS NULL OR "formations"."duration_hours" > 0),
	CONSTRAINT "formations_price_non_negative" CHECK ("formations"."price_minor" IS NULL OR "formations"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "formations_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "formations_locks_resource_id_unique" UNIQUE("resource_id")
);
--> statement-breakpoint
CREATE TABLE "formations_revisions" (
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
ALTER TABLE "formation_translations" ADD CONSTRAINT "formation_translations_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_translations" ADD CONSTRAINT "formation_translations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formations" ADD CONSTRAINT "formations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formations" ADD CONSTRAINT "formations_cover_image_id_media_files_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formations" ADD CONSTRAINT "formations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formations_locks" ADD CONSTRAINT "formations_locks_resource_id_formations_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formations_locks" ADD CONSTRAINT "formations_locks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formations_revisions" ADD CONSTRAINT "formations_revisions_resource_id_formations_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formations_revisions" ADD CONSTRAINT "formations_revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "formation_translations_formation_locale_uidx" ON "formation_translations" USING btree ("formation_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "formation_translations_org_locale_slug_uidx" ON "formation_translations" USING btree ("organization_id","locale","slug") WHERE "formation_translations"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "formation_translations_global_locale_slug_uidx" ON "formation_translations" USING btree ("locale","slug") WHERE "formation_translations"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "formations_org_slug_uidx" ON "formations" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "formations_org_idx" ON "formations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "formations_status_idx" ON "formations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "formations_revisions_resource_idx" ON "formations_revisions" USING btree ("resource_id");