-- Retour arrière de 0052_notifications_core (N1-A) : recrée blog_notifications et
-- service_notifications à l'identique (contraintes, index, FK) et y recopie les lignes
-- de "notifications" (module blog / services), puis supprime les tables partagées.
-- Usage : psql -v ON_ERROR_STOP=1 -1 -f 0052_notifications_core.down.sql
CREATE TABLE "blog_notifications" (
  "id" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL, "type" text NOT NULL, "post_id" text,
  "comment_id" text, "review_id" text, "from_user_id" text, "is_read" boolean DEFAULT false NOT NULL,
  "metadata" jsonb, "created_at" timestamp DEFAULT now() NOT NULL, "organization_id" text,
  CONSTRAINT "blog_notifications_single_target" CHECK (("post_id" IS NOT NULL) AND (NOT (("comment_id" IS NOT NULL) AND ("review_id" IS NOT NULL))))
);
CREATE TABLE "service_notifications" (
  "id" text PRIMARY KEY NOT NULL, "recipient_id" text NOT NULL, "actor_id" text, "service_id" text NOT NULL,
  "comment_id" text, "review_id" text, "type" text NOT NULL, "title" text NOT NULL, "message" text NOT NULL,
  "read_at" timestamp, "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "service_notification_review_target_consistency" CHECK (NOT ("type" IN ('NEW_REVIEW','REVIEW_APPROVED','REVIEW_REJECTED') AND "review_id" IS NULL)),
  CONSTRAINT "service_notification_target_consistency" CHECK (CASE
    WHEN "type" IN ('NEW_COMMENT','REPLY_TO_COMMENT') THEN "comment_id" IS NOT NULL AND "review_id" IS NULL
    WHEN "type" IN ('NEW_REVIEW','REVIEW_APPROVED','REVIEW_REJECTED') THEN "review_id" IS NOT NULL AND "comment_id" IS NULL
    WHEN "type" IN ('SERVICE_PUBLISHED','SERVICE_MENTION') THEN "comment_id" IS NULL AND "review_id" IS NULL
    ELSE false END)
);
INSERT INTO "blog_notifications" ("id","user_id","type","post_id","comment_id","review_id","from_user_id","is_read","metadata","created_at","organization_id")
SELECT "id","user_id","type","resource_id","data"->>'commentId',"data"->>'reviewId',"actor_id","read_at" IS NOT NULL,"data"->'metadata',"created_at","organization_id"
FROM "notifications" WHERE "module" = 'blog' AND "resource_type" = 'post' AND "resource_id" IS NOT NULL;
INSERT INTO "service_notifications" ("id","recipient_id","actor_id","service_id","comment_id","review_id","type","title","message","read_at","created_at")
SELECT "id","user_id","actor_id","resource_id","data"->>'commentId',"data"->>'reviewId',"type",coalesce("title",''),coalesce("message",''),"read_at","created_at"
FROM "notifications" WHERE "module" = 'services' AND "resource_type" = 'service' AND "resource_id" IS NOT NULL;
CREATE INDEX "blog_notifications_created_idx" ON "blog_notifications" ("created_at");
CREATE INDEX "blog_notifications_org_user_idx" ON "blog_notifications" ("organization_id","user_id");
CREATE INDEX "blog_notifications_read_idx" ON "blog_notifications" ("is_read");
CREATE INDEX "blog_notifications_type_idx" ON "blog_notifications" ("type");
CREATE INDEX "blog_notifications_user_idx" ON "blog_notifications" ("user_id");
CREATE INDEX "service_notifications_created_idx" ON "service_notifications" ("created_at");
CREATE INDEX "service_notifications_recipient_idx" ON "service_notifications" ("recipient_id","read_at");
CREATE INDEX "service_notifications_service_idx" ON "service_notifications" ("service_id");
ALTER TABLE "blog_notifications" ADD CONSTRAINT "blog_notifications_comment_id_blog_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "blog_comments"("id") ON DELETE CASCADE;
ALTER TABLE "blog_notifications" ADD CONSTRAINT "blog_notifications_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "user"("id") ON DELETE SET NULL;
ALTER TABLE "blog_notifications" ADD CONSTRAINT "blog_notifications_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
ALTER TABLE "blog_notifications" ADD CONSTRAINT "blog_notifications_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "blog_posts"("id") ON DELETE CASCADE;
ALTER TABLE "blog_notifications" ADD CONSTRAINT "blog_notifications_review_id_blog_post_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "blog_post_reviews"("id") ON DELETE CASCADE;
ALTER TABLE "blog_notifications" ADD CONSTRAINT "blog_notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
ALTER TABLE "service_notifications" ADD CONSTRAINT "service_notifications_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL;
ALTER TABLE "service_notifications" ADD CONSTRAINT "service_notifications_comment_id_service_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "service_comments"("id") ON DELETE CASCADE;
ALTER TABLE "service_notifications" ADD CONSTRAINT "service_notifications_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "user"("id") ON DELETE CASCADE;
ALTER TABLE "service_notifications" ADD CONSTRAINT "service_notifications_review_id_service_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "service_reviews"("id") ON DELETE CASCADE;
ALTER TABLE "service_notifications" ADD CONSTRAINT "service_notifications_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE;
DROP TRIGGER IF EXISTS "blog_posts_notifications_cascade" ON "blog_posts";
DROP TRIGGER IF EXISTS "blog_comments_notifications_cascade" ON "blog_comments";
DROP TRIGGER IF EXISTS "blog_post_reviews_notifications_cascade" ON "blog_post_reviews";
DROP TRIGGER IF EXISTS "services_notifications_cascade" ON "services";
DROP TRIGGER IF EXISTS "service_comments_notifications_cascade" ON "service_comments";
DROP TRIGGER IF EXISTS "service_reviews_notifications_cascade" ON "service_reviews";
DROP FUNCTION IF EXISTS notifications_cascade_resource();
DROP TABLE "email_outbox";
DROP TABLE "notification_preferences";
DROP TABLE "notifications";
DELETE FROM "__drizzle_migrations" WHERE "id" = '0052_notifications_core';
