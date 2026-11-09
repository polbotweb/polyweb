-- Retour arrière de 0053_moderation_core (docs/moderation.md, « Migration 0053 »).
-- 1. Refus explicite si une archive d'un retour arrière précédent existe encore (à examiner d'abord).
-- 2. Recrée blog_reports, service_reports et blog_comment_moderations à l'identique (contraintes,
--    index, FK) et y recopie tout ce que ces schémas savent exprimer : valeurs d'origine exactes
--    ("legacy") quand la ligne historique n'a pas changé de sens, sinon la correspondance inverse.
-- 3. Ne détruit rien : moderation_reports / moderation_actions sont renommées en *_0053_archive
--    (décisions hide/restore/spam/resolve/dismiss, empreintes de signaleur, historiques sans
--    modérateur, cibles services/avis… que les anciens schémas ne peuvent pas représenter).
-- Usage : psql -v ON_ERROR_STOP=1 -1 -f 0053_moderation_core.down.sql
DO $$
BEGIN
  IF to_regclass('moderation_reports_0053_archive') IS NOT NULL OR to_regclass('moderation_actions_0053_archive') IS NOT NULL THEN
    RAISE EXCEPTION '0053 down refusé : archives *_0053_archive déjà présentes (les examiner puis les supprimer avant un nouveau retour arrière)';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE TABLE "blog_comment_moderations" (
  "id" text PRIMARY KEY NOT NULL, "comment_id" text NOT NULL, "moderator_id" text NOT NULL, "action" text NOT NULL,
  "reason" text, "previous_values" jsonb, "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_reports" (
  "id" text PRIMARY KEY NOT NULL, "post_id" text, "comment_id" text, "review_id" text, "reporter_id" text,
  "reason" text NOT NULL, "description" text, "status" text DEFAULT 'PENDING' NOT NULL, "resolved_by" text,
  "resolved_at" timestamp, "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "blog_reports_single_target" CHECK ((("post_id" IS NOT NULL)::int + ("comment_id" IS NOT NULL)::int + ("review_id" IS NOT NULL)::int) = 1)
);
--> statement-breakpoint
CREATE TABLE "service_reports" (
  "id" text PRIMARY KEY NOT NULL, "service_id" text, "comment_id" text, "review_id" text, "reporter_id" text,
  "reason" text NOT NULL, "description" text, "status" text DEFAULT 'PENDING' NOT NULL, "resolved_by" text,
  "resolved_at" timestamp, "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "service_reports_single_target" CHECK ((("service_id" IS NOT NULL)::int + ("comment_id" IS NOT NULL)::int + ("review_id" IS NOT NULL)::int) = 1)
);
--> statement-breakpoint
INSERT INTO "blog_reports" ("id","post_id","comment_id","review_id","reporter_id","reason","description","status","resolved_by","resolved_at","created_at")
SELECT r."id",
  CASE WHEN r."target_type" = 'post' THEN r."target_id" END,
  CASE WHEN r."target_type" = 'comment' THEN r."target_id" END,
  CASE WHEN r."target_type" = 'review' THEN r."target_id" END,
  r."reporter_id",
  CASE WHEN r."legacy" ->> 'table' = 'blog_reports'
        AND (CASE WHEN upper(r."legacy" ->> 'reason') IN ('SPAM','ABUSIVE','OFF_TOPIC','HATE_SPEECH') THEN lower(r."legacy" ->> 'reason') ELSE 'other' END) = r."reason"
       THEN r."legacy" ->> 'reason' ELSE upper(r."reason") END,
  r."description",
  CASE WHEN r."legacy" ->> 'table' = 'blog_reports'
        AND (CASE r."legacy" ->> 'status' WHEN 'RESOLVED' THEN 'resolved' WHEN 'REJECTED' THEN 'dismissed' ELSE 'open' END) = r."status"
       THEN r."legacy" ->> 'status'
       ELSE CASE r."status" WHEN 'resolved' THEN 'RESOLVED' WHEN 'dismissed' THEN 'REJECTED' ELSE 'PENDING' END END,
  r."resolved_by", r."resolved_at", r."created_at"
FROM "moderation_reports" r
WHERE r."module" = 'blog' AND (r."legacy" IS NULL OR r."legacy" ->> 'table' = 'blog_reports')
  AND ((r."target_type" = 'post' AND EXISTS (SELECT 1 FROM "blog_posts" t WHERE t."id" = r."target_id"))
    OR (r."target_type" = 'comment' AND EXISTS (SELECT 1 FROM "blog_comments" t WHERE t."id" = r."target_id"))
    OR (r."target_type" = 'review' AND EXISTS (SELECT 1 FROM "blog_post_reviews" t WHERE t."id" = r."target_id")));
--> statement-breakpoint
INSERT INTO "service_reports" ("id","service_id","comment_id","review_id","reporter_id","reason","description","status","resolved_by","resolved_at","created_at")
SELECT r."id",
  CASE WHEN r."target_type" = 'service' THEN r."target_id" END,
  CASE WHEN r."target_type" = 'comment' THEN r."target_id" END,
  CASE WHEN r."target_type" = 'review' THEN r."target_id" END,
  r."reporter_id",
  CASE WHEN r."legacy" ->> 'table' = 'service_reports'
        AND (CASE WHEN upper(r."legacy" ->> 'reason') IN ('SPAM','ABUSIVE','OFF_TOPIC','HATE_SPEECH') THEN lower(r."legacy" ->> 'reason') ELSE 'other' END) = r."reason"
       THEN r."legacy" ->> 'reason' ELSE upper(r."reason") END,
  r."description",
  CASE WHEN r."legacy" ->> 'table' = 'service_reports'
        AND (CASE r."legacy" ->> 'status' WHEN 'RESOLVED' THEN 'resolved' WHEN 'REJECTED' THEN 'dismissed' ELSE 'open' END) = r."status"
       THEN r."legacy" ->> 'status'
       ELSE CASE r."status" WHEN 'resolved' THEN 'RESOLVED' WHEN 'dismissed' THEN 'REJECTED' ELSE 'PENDING' END END,
  r."resolved_by", r."resolved_at", r."created_at"
FROM "moderation_reports" r
WHERE r."module" = 'services' AND (r."legacy" IS NULL OR r."legacy" ->> 'table' = 'service_reports')
  AND ((r."target_type" = 'service' AND EXISTS (SELECT 1 FROM "services" t WHERE t."id" = r."target_id"))
    OR (r."target_type" = 'comment' AND EXISTS (SELECT 1 FROM "service_comments" t WHERE t."id" = r."target_id"))
    OR (r."target_type" = 'review' AND EXISTS (SELECT 1 FROM "service_reviews" t WHERE t."id" = r."target_id")));
--> statement-breakpoint
INSERT INTO "blog_comment_moderations" ("id","comment_id","moderator_id","action","reason","previous_values","created_at")
SELECT a."id", a."target_id", a."actor_id",
  CASE a."action" WHEN 'approve' THEN 'APPROVE' WHEN 'reject' THEN 'REJECT' WHEN 'trash' THEN 'DELETE' WHEN 'reset' THEN 'RESTORE' ELSE 'EDIT' END,
  a."note", a."previous_values", a."created_at"
FROM "moderation_actions" a
WHERE a."module" = 'blog' AND a."target_type" = 'comment' AND a."action" IN ('approve','reject','trash','reset','edit')
  AND a."actor_id" IS NOT NULL AND EXISTS (SELECT 1 FROM "blog_comments" t WHERE t."id" = a."target_id");
--> statement-breakpoint
ALTER TABLE "blog_comment_moderations" ADD CONSTRAINT "blog_comment_moderations_comment_id_blog_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."blog_comments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blog_comment_moderations" ADD CONSTRAINT "blog_comment_moderations_moderator_id_user_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blog_reports" ADD CONSTRAINT "blog_reports_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blog_reports" ADD CONSTRAINT "blog_reports_comment_id_blog_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."blog_comments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blog_reports" ADD CONSTRAINT "blog_reports_review_id_blog_post_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."blog_post_reviews"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blog_reports" ADD CONSTRAINT "blog_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blog_reports" ADD CONSTRAINT "blog_reports_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_comment_id_service_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."service_comments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_review_id_service_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."service_reviews"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "blog_comment_moderations_comment_idx" ON "blog_comment_moderations" USING btree ("comment_id");
--> statement-breakpoint
CREATE INDEX "blog_comment_moderations_moderator_idx" ON "blog_comment_moderations" USING btree ("moderator_id");
--> statement-breakpoint
CREATE INDEX "blog_reports_status_idx" ON "blog_reports" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "blog_reports_reporter_idx" ON "blog_reports" USING btree ("reporter_id");
--> statement-breakpoint
CREATE INDEX "service_reports_status_idx" ON "service_reports" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "service_reports_reporter_idx" ON "service_reports" USING btree ("reporter_id");
--> statement-breakpoint
DROP TRIGGER IF EXISTS "blog_posts_moderation_cascade" ON "blog_posts";
--> statement-breakpoint
DROP TRIGGER IF EXISTS "blog_comments_moderation_cascade" ON "blog_comments";
--> statement-breakpoint
DROP TRIGGER IF EXISTS "blog_post_reviews_moderation_cascade" ON "blog_post_reviews";
--> statement-breakpoint
DROP TRIGGER IF EXISTS "services_moderation_cascade" ON "services";
--> statement-breakpoint
DROP TRIGGER IF EXISTS "service_comments_moderation_cascade" ON "service_comments";
--> statement-breakpoint
DROP TRIGGER IF EXISTS "service_reviews_moderation_cascade" ON "service_reviews";
--> statement-breakpoint
DROP FUNCTION IF EXISTS moderation_cascade_target();
--> statement-breakpoint
DROP INDEX "moderation_reports_open_dedupe_uidx";
--> statement-breakpoint
DROP INDEX "moderation_reports_queue_idx";
--> statement-breakpoint
DROP INDEX "moderation_reports_target_idx";
--> statement-breakpoint
DROP INDEX "moderation_reports_reporter_idx";
--> statement-breakpoint
DROP INDEX "moderation_actions_target_idx";
--> statement-breakpoint
DROP INDEX "moderation_actions_org_idx";
--> statement-breakpoint
DROP INDEX "moderation_actions_actor_idx";
--> statement-breakpoint
ALTER TABLE "moderation_reports" RENAME CONSTRAINT "moderation_reports_pkey" TO "moderation_reports_0053_archive_pkey";
--> statement-breakpoint
ALTER TABLE "moderation_actions" RENAME CONSTRAINT "moderation_actions_pkey" TO "moderation_actions_0053_archive_pkey";
--> statement-breakpoint
ALTER TABLE "moderation_reports" RENAME TO "moderation_reports_0053_archive";
--> statement-breakpoint
ALTER TABLE "moderation_actions" RENAME TO "moderation_actions_0053_archive";
