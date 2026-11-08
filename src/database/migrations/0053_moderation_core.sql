-- 0053 — modération générique (docs/moderation.md).
-- Crée moderation_reports / moderation_actions, y reprend blog_reports, service_reports et
-- blog_comment_moderations (identifiants, valeurs d'origine dans "legacy", horodatages), installe
-- les déclencheurs de suppression en cascade avec la cible, puis supprime les tables historiques.
-- Retour arrière : down/0053_moderation_core.down.sql (exact sur les données historiques ;
-- données génériques non exprimables conservées dans des tables d'archive, jamais perdues).
CREATE TABLE "moderation_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"module" varchar(40) NOT NULL,
	"target_type" varchar(40) NOT NULL,
	"target_id" text NOT NULL,
	"organization_id" text,
	"actor_id" text,
	"action" varchar(20) NOT NULL,
	"reason_code" varchar(40),
	"note" text,
	"from_status" varchar(20),
	"to_status" varchar(20),
	"previous_values" jsonb,
	"legacy" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"module" varchar(40) NOT NULL,
	"target_type" varchar(40) NOT NULL,
	"target_id" text NOT NULL,
	"organization_id" text,
	"reporter_id" text,
	"reporter_key" varchar(96) NOT NULL,
	"reason" varchar(20) NOT NULL,
	"description" text,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"legacy" jsonb,
	CONSTRAINT "moderation_reports_reason_check" CHECK ("moderation_reports"."reason" IN ('spam', 'abusive', 'off_topic', 'hate_speech', 'other')),
	CONSTRAINT "moderation_reports_status_check" CHECK ("moderation_reports"."status" IN ('open', 'resolved', 'dismissed'))
);
--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_actions_target_idx" ON "moderation_actions" USING btree ("module","target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "moderation_actions_org_idx" ON "moderation_actions" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "moderation_actions_actor_idx" ON "moderation_actions" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_reports_open_dedupe_uidx" ON "moderation_reports" USING btree ("module","target_type","target_id","reporter_key") WHERE "moderation_reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "moderation_reports_queue_idx" ON "moderation_reports" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "moderation_reports_target_idx" ON "moderation_reports" USING btree ("module","target_type","target_id");--> statement-breakpoint
CREATE INDEX "moderation_reports_reporter_idx" ON "moderation_reports" USING btree ("reporter_id");;
--> statement-breakpoint
INSERT INTO "moderation_reports" ("id","module","target_type","target_id","organization_id","reporter_id","reporter_key","reason","description","status","resolved_by","resolved_at","created_at","legacy")
SELECT r."id", 'blog',
  CASE WHEN r."post_id" IS NOT NULL THEN 'post' WHEN r."comment_id" IS NOT NULL THEN 'comment' ELSE 'review' END,
  coalesce(r."post_id", r."comment_id", r."review_id"),
  coalesce(p."organization_id", pc."organization_id", pr."organization_id"),
  r."reporter_id", 'legacy:' || r."id",
  CASE WHEN upper(r."reason") IN ('SPAM','ABUSIVE','OFF_TOPIC','HATE_SPEECH') THEN lower(r."reason") ELSE 'other' END,
  r."description",
  CASE r."status" WHEN 'RESOLVED' THEN 'resolved' WHEN 'REJECTED' THEN 'dismissed' ELSE 'open' END,
  r."resolved_by", r."resolved_at", r."created_at",
  jsonb_build_object('table', 'blog_reports', 'status', r."status", 'reason', r."reason")
FROM "blog_reports" r
LEFT JOIN "blog_posts" p ON p."id" = r."post_id"
LEFT JOIN "blog_comments" c ON c."id" = r."comment_id"
LEFT JOIN "blog_posts" pc ON pc."id" = c."post_id"
LEFT JOIN "blog_post_reviews" v ON v."id" = r."review_id"
LEFT JOIN "blog_posts" pr ON pr."id" = v."post_id";
--> statement-breakpoint
INSERT INTO "moderation_reports" ("id","module","target_type","target_id","organization_id","reporter_id","reporter_key","reason","description","status","resolved_by","resolved_at","created_at","legacy")
SELECT r."id", 'services',
  CASE WHEN r."service_id" IS NOT NULL THEN 'service' WHEN r."comment_id" IS NOT NULL THEN 'comment' ELSE 'review' END,
  coalesce(r."service_id", r."comment_id", r."review_id"),
  coalesce(s."organization_id", sc."organization_id", sr."organization_id"),
  r."reporter_id", 'legacy:' || r."id",
  CASE WHEN upper(r."reason") IN ('SPAM','ABUSIVE','OFF_TOPIC','HATE_SPEECH') THEN lower(r."reason") ELSE 'other' END,
  r."description",
  CASE r."status" WHEN 'RESOLVED' THEN 'resolved' WHEN 'REJECTED' THEN 'dismissed' ELSE 'open' END,
  r."resolved_by", r."resolved_at", r."created_at",
  jsonb_build_object('table', 'service_reports', 'status', r."status", 'reason', r."reason")
FROM "service_reports" r
LEFT JOIN "services" s ON s."id" = r."service_id"
LEFT JOIN "service_comments" c ON c."id" = r."comment_id"
LEFT JOIN "services" sc ON sc."id" = c."service_id"
LEFT JOIN "service_reviews" v ON v."id" = r."review_id"
LEFT JOIN "services" sr ON sr."id" = v."service_id";
--> statement-breakpoint
INSERT INTO "moderation_actions" ("id","module","target_type","target_id","organization_id","actor_id","action","note","from_status","previous_values","created_at","legacy")
SELECT m."id", 'blog', 'comment', m."comment_id", p."organization_id", m."moderator_id",
  CASE m."action" WHEN 'APPROVE' THEN 'approve' WHEN 'REJECT' THEN 'reject' WHEN 'DELETE' THEN 'trash' WHEN 'RESTORE' THEN 'reset' ELSE 'edit' END,
  m."reason", m."previous_values" ->> 'status', m."previous_values", m."created_at",
  jsonb_build_object('table', 'blog_comment_moderations', 'action', m."action")
FROM "blog_comment_moderations" m
LEFT JOIN "blog_comments" c ON c."id" = m."comment_id"
LEFT JOIN "blog_posts" p ON p."id" = c."post_id";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION moderation_cascade_target() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "moderation_reports" WHERE "module" = TG_ARGV[0] AND "target_type" = TG_ARGV[1] AND "target_id" = OLD."id";
  DELETE FROM "moderation_actions" WHERE "module" = TG_ARGV[0] AND "target_type" = TG_ARGV[1] AND "target_id" = OLD."id";
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "blog_posts_moderation_cascade" AFTER DELETE ON "blog_posts" FOR EACH ROW EXECUTE FUNCTION moderation_cascade_target('blog', 'post');
--> statement-breakpoint
CREATE TRIGGER "blog_comments_moderation_cascade" AFTER DELETE ON "blog_comments" FOR EACH ROW EXECUTE FUNCTION moderation_cascade_target('blog', 'comment');
--> statement-breakpoint
CREATE TRIGGER "blog_post_reviews_moderation_cascade" AFTER DELETE ON "blog_post_reviews" FOR EACH ROW EXECUTE FUNCTION moderation_cascade_target('blog', 'review');
--> statement-breakpoint
CREATE TRIGGER "services_moderation_cascade" AFTER DELETE ON "services" FOR EACH ROW EXECUTE FUNCTION moderation_cascade_target('services', 'service');
--> statement-breakpoint
CREATE TRIGGER "service_comments_moderation_cascade" AFTER DELETE ON "service_comments" FOR EACH ROW EXECUTE FUNCTION moderation_cascade_target('services', 'comment');
--> statement-breakpoint
CREATE TRIGGER "service_reviews_moderation_cascade" AFTER DELETE ON "service_reviews" FOR EACH ROW EXECUTE FUNCTION moderation_cascade_target('services', 'review');
--> statement-breakpoint
DROP TABLE "blog_comment_moderations" CASCADE;
--> statement-breakpoint
DROP TABLE "blog_reports" CASCADE;
--> statement-breakpoint
DROP TABLE "service_reports" CASCADE;
