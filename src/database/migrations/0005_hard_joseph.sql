ALTER TABLE "blog_notifications" DROP CONSTRAINT "blog_notifications_single_target";--> statement-breakpoint
ALTER TABLE "blog_subscribers" ALTER COLUMN "token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "blog_notifications" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "blog_subscribers" ADD COLUMN "confirmation_token_hash" text;--> statement-breakpoint
ALTER TABLE "blog_subscribers" ADD COLUMN "confirmation_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "blog_subscribers" ADD COLUMN "confirmation_token_used_at" timestamp;--> statement-breakpoint
ALTER TABLE "blog_subscribers" ADD COLUMN "unsubscribe_token_hash" text;--> statement-breakpoint
ALTER TABLE "blog_subscribers" ADD COLUMN "unsubscribe_token_used_at" timestamp;--> statement-breakpoint
ALTER TABLE "blog_notifications" ADD CONSTRAINT "blog_notifications_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Migration 0004 introduced denormalized translation scopes without backfilling
-- them and removed the entity+locale uniqueness guarantees. Abort with a clear,
-- actionable error if duplicates accumulated; never choose or delete a row.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "blog_post_translations"
    GROUP BY "post_id", "locale"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = '0005 blocked: duplicate blog_post_translations(post_id, locale)',
      HINT = 'Quarantine or merge duplicate post translations, then rerun the migration. No row was deleted.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "blog_category_translations"
    GROUP BY "category_id", "locale"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = '0005 blocked: duplicate blog_category_translations(category_id, locale)',
      HINT = 'Quarantine or merge duplicate category translations, then rerun the migration. No row was deleted.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "blog_tag_translations"
    GROUP BY "tag_id", "locale"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = '0005 blocked: duplicate blog_tag_translations(tag_id, locale)',
      HINT = 'Quarantine or merge duplicate tag translations, then rerun the migration. No row was deleted.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "blog_post_translations" translation
    INNER JOIN "blog_posts" parent ON parent."id" = translation."post_id"
    GROUP BY parent."organization_id", translation."locale", translation."slug"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = '0005 blocked: duplicate post translation slug in the effective tenant/locale',
      HINT = 'Quarantine or rename conflicting slugs, then rerun the migration. No row was deleted.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "blog_category_translations" translation
    INNER JOIN "blog_categories" parent ON parent."id" = translation."category_id"
    GROUP BY parent."organization_id", translation."locale", translation."slug"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = '0005 blocked: duplicate category translation slug in the effective tenant/locale',
      HINT = 'Quarantine or rename conflicting slugs, then rerun the migration. No row was deleted.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "blog_tag_translations" translation
    INNER JOIN "blog_tags" parent ON parent."id" = translation."tag_id"
    GROUP BY parent."organization_id", translation."locale", translation."slug"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = '0005 blocked: duplicate tag translation slug in the effective tenant/locale',
      HINT = 'Quarantine or rename conflicting slugs, then rerun the migration. No row was deleted.';
  END IF;
END
$$;--> statement-breakpoint

UPDATE "blog_post_translations" translation
SET "organization_id" = parent."organization_id"
FROM "blog_posts" parent
WHERE parent."id" = translation."post_id"
  AND translation."organization_id" IS DISTINCT FROM parent."organization_id";--> statement-breakpoint
UPDATE "blog_category_translations" translation
SET "organization_id" = parent."organization_id"
FROM "blog_categories" parent
WHERE parent."id" = translation."category_id"
  AND translation."organization_id" IS DISTINCT FROM parent."organization_id";--> statement-breakpoint
UPDATE "blog_tag_translations" translation
SET "organization_id" = parent."organization_id"
FROM "blog_tags" parent
WHERE parent."id" = translation."tag_id"
  AND translation."organization_id" IS DISTINCT FROM parent."organization_id";--> statement-breakpoint

CREATE UNIQUE INDEX "blog_category_translations_category_locale_uidx" ON "blog_category_translations" USING btree ("category_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_post_translations_post_locale_uidx" ON "blog_post_translations" USING btree ("post_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_tag_translations_tag_locale_uidx" ON "blog_tag_translations" USING btree ("tag_id","locale");--> statement-breakpoint

-- Keep each denormalized translation scope synchronized with its parent. This
-- covers imports and maintenance SQL in addition to the application checks.
CREATE OR REPLACE FUNCTION "enforce_blog_translation_organization_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_organization_id text;
BEGIN
  IF TG_TABLE_NAME = 'blog_post_translations' THEN
    SELECT "organization_id" INTO parent_organization_id
    FROM "blog_posts"
    WHERE "id" = NEW."post_id";
  ELSIF TG_TABLE_NAME = 'blog_category_translations' THEN
    SELECT "organization_id" INTO parent_organization_id
    FROM "blog_categories"
    WHERE "id" = NEW."category_id";
  ELSIF TG_TABLE_NAME = 'blog_tag_translations' THEN
    SELECT "organization_id" INTO parent_organization_id
    FROM "blog_tags"
    WHERE "id" = NEW."tag_id";
  END IF;

  IF NEW."organization_id" IS DISTINCT FROM parent_organization_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('%s organization_id must match its parent tenant', TG_TABLE_NAME);
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "blog_post_translations_tenant_check"
BEFORE INSERT OR UPDATE OF "post_id", "organization_id"
ON "blog_post_translations"
FOR EACH ROW EXECUTE FUNCTION "enforce_blog_translation_organization_scope"();--> statement-breakpoint
CREATE TRIGGER "blog_category_translations_tenant_check"
BEFORE INSERT OR UPDATE OF "category_id", "organization_id"
ON "blog_category_translations"
FOR EACH ROW EXECUTE FUNCTION "enforce_blog_translation_organization_scope"();--> statement-breakpoint
CREATE TRIGGER "blog_tag_translations_tenant_check"
BEFORE INSERT OR UPDATE OF "tag_id", "organization_id"
ON "blog_tag_translations"
FOR EACH ROW EXECUTE FUNCTION "enforce_blog_translation_organization_scope"();--> statement-breakpoint

-- Existing notifications used either a post target or a comment/review target.
-- Add the owning post as context, then persist the tenant directly.
UPDATE "blog_notifications" notification
SET "post_id" = COALESCE(
  notification."post_id",
  (SELECT comment."post_id" FROM "blog_comments" comment WHERE comment."id" = notification."comment_id"),
  (SELECT review."post_id" FROM "blog_post_reviews" review WHERE review."id" = notification."review_id")
);--> statement-breakpoint
UPDATE "blog_notifications" notification
SET "organization_id" = post."organization_id"
FROM "blog_posts" post
WHERE post."id" = notification."post_id";--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "blog_notifications" notification
    LEFT JOIN "blog_comments" comment ON comment."id" = notification."comment_id"
    LEFT JOIN "blog_post_reviews" review ON review."id" = notification."review_id"
    WHERE notification."post_id" IS NULL
       OR (notification."comment_id" IS NOT NULL AND notification."review_id" IS NOT NULL)
       OR (comment."id" IS NOT NULL AND comment."post_id" <> notification."post_id")
       OR (review."id" IS NOT NULL AND review."post_id" <> notification."post_id")
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = '0005 blocked: a blog notification has an invalid or cross-post subject',
      HINT = 'Repair or quarantine the notification; post_id must be context and at most one comment/review may be the subject.';
  END IF;

  IF EXISTS (SELECT 1 FROM "blog_post_reviews" WHERE "rating" NOT BETWEEN 1 AND 5) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = '0005 blocked: blog_post_reviews.rating must be between 1 and 5';
  END IF;
  IF EXISTS (SELECT 1 FROM "blog_post_view_stats" WHERE "hour" NOT BETWEEN 0 AND 23) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = '0005 blocked: blog_post_view_stats.hour must be between 0 and 23';
  END IF;
  IF EXISTS (SELECT 1 FROM "blog_post_links" WHERE "source_post_id" = "target_post_id") THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = '0005 blocked: self-referential blog_post_links must be quarantined or removed';
  END IF;
END
$$;--> statement-breakpoint

CREATE INDEX "blog_notifications_org_user_idx" ON "blog_notifications" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_subscribers_confirmation_token_hash_uidx" ON "blog_subscribers" USING btree ("confirmation_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_subscribers_unsubscribe_token_hash_uidx" ON "blog_subscribers" USING btree ("unsubscribe_token_hash");--> statement-breakpoint
CREATE INDEX "blog_subscribers_confirmation_expires_idx" ON "blog_subscribers" USING btree ("confirmation_token_expires_at");--> statement-breakpoint

ALTER TABLE "blog_notifications" ADD CONSTRAINT "blog_notifications_single_target" CHECK ((
  "blog_notifications"."post_id" IS NOT NULL
  AND NOT ("blog_notifications"."comment_id" IS NOT NULL AND "blog_notifications"."review_id" IS NOT NULL)
));--> statement-breakpoint
ALTER TABLE "blog_post_links" ADD CONSTRAINT "blog_post_links_no_self_check" CHECK ("blog_post_links"."source_post_id" <> "blog_post_links"."target_post_id");--> statement-breakpoint
ALTER TABLE "blog_post_reviews" ADD CONSTRAINT "blog_post_reviews_rating_check" CHECK ("blog_post_reviews"."rating" BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "blog_post_view_stats" ADD CONSTRAINT "blog_post_view_stats_hour_check" CHECK ("blog_post_view_stats"."hour" BETWEEN 0 AND 23);--> statement-breakpoint
ALTER TABLE "blog_subscribers" ADD CONSTRAINT "blog_subscribers_token_purpose_check" CHECK (
  "blog_subscribers"."confirmation_token_hash" IS NULL
  OR "blog_subscribers"."unsubscribe_token_hash" IS NULL
  OR "blog_subscribers"."confirmation_token_hash" <> "blog_subscribers"."unsubscribe_token_hash"
  OR ("blog_subscribers"."token" IS NULL AND "blog_subscribers"."token_used_at" IS NOT NULL)
);

-- Legacy compatibility: pre-0005 plaintext token/token_used_at columns remain
-- readable only by the explicit legacy branch in blog-newsletter-service.ts.
-- New subscriptions leave token NULL and use purpose-bound hashes. Remove the
-- legacy columns in a later release after all previously issued links expire.
