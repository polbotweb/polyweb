DROP INDEX IF EXISTS "media_folders_parentId_name_uidx";--> statement-breakpoint
ALTER TABLE "media_files" ADD COLUMN IF NOT EXISTS "organization_id" text;--> statement-breakpoint
ALTER TABLE "media_folders" ADD COLUMN IF NOT EXISTS "organization_id" text;--> statement-breakpoint
ALTER TABLE "blog_category_translations" ADD COLUMN IF NOT EXISTS "slug" text;--> statement-breakpoint
ALTER TABLE "blog_tag_translations" ADD COLUMN IF NOT EXISTS "slug" text;--> statement-breakpoint
UPDATE "blog_category_translations" AS ct
SET "slug" = c."slug"
FROM "blog_categories" AS c
WHERE ct."category_id" = c."id"
	AND ct."slug" IS NULL;--> statement-breakpoint
UPDATE "blog_tag_translations" AS tt
SET "slug" = t."slug"
FROM "blog_tags" AS t
WHERE tt."tag_id" = t."id"
	AND tt."slug" IS NULL;--> statement-breakpoint
ALTER TABLE "blog_category_translations" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "blog_tag_translations" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_files_organizationId_idx" ON "media_files" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_folders_org_parent_name_uidx" ON "media_folders" USING btree ("organization_id","parent_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_folders_organizationId_idx" ON "media_folders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blog_category_translations_locale_slug_idx" ON "blog_category_translations" USING btree ("locale","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blog_tag_translations_locale_slug_idx" ON "blog_tag_translations" USING btree ("locale","slug");