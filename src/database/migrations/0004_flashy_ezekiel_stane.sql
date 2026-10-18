DROP INDEX "blog_category_translations_cat_locale_uidx";--> statement-breakpoint
DROP INDEX "blog_post_translations_post_locale_uidx";--> statement-breakpoint
DROP INDEX "blog_tag_translations_tag_locale_uidx";--> statement-breakpoint
ALTER TABLE "blog_category_translations" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "blog_post_translations" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "blog_subscribers" ADD COLUMN "token_used_at" timestamp;--> statement-breakpoint
ALTER TABLE "blog_tag_translations" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "blog_category_translations" ADD CONSTRAINT "blog_category_translations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_translations" ADD CONSTRAINT "blog_post_translations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_tag_translations" ADD CONSTRAINT "blog_tag_translations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blog_category_translations_org_locale_slug_uidx" ON "blog_category_translations" USING btree ("organization_id","locale","slug") WHERE "blog_category_translations"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "blog_category_translations_global_locale_slug_uidx" ON "blog_category_translations" USING btree ("locale","slug") WHERE "blog_category_translations"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "blog_post_translations_org_locale_slug_uidx" ON "blog_post_translations" USING btree ("organization_id","locale","slug") WHERE "blog_post_translations"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "blog_post_translations_global_locale_slug_uidx" ON "blog_post_translations" USING btree ("locale","slug") WHERE "blog_post_translations"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "blog_tag_translations_org_locale_slug_uidx" ON "blog_tag_translations" USING btree ("organization_id","locale","slug") WHERE "blog_tag_translations"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "blog_tag_translations_global_locale_slug_uidx" ON "blog_tag_translations" USING btree ("locale","slug") WHERE "blog_tag_translations"."organization_id" IS NULL;