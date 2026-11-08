CREATE TABLE "email_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"dedupe_key" varchar(200) NOT NULL,
	"user_id" text,
	"organization_id" text,
	"to_email" text NOT NULL,
	"locale" varchar(5) NOT NULL,
	"template" varchar(120) NOT NULL,
	"category" varchar(40) NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" varchar(120),
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_outbox_attempts_check" CHECK ("email_outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" text NOT NULL,
	"category" varchar(40) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_category_channel_pk" PRIMARY KEY("user_id","category","channel")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"module" varchar(40) NOT NULL,
	"type" varchar(80) NOT NULL,
	"category" varchar(40) NOT NULL,
	"actor_id" text,
	"resource_type" varchar(40),
	"resource_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"title" text,
	"message" text,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"dedupe_key" varchar(200)
);
--> statement-breakpoint
-- Reprise SANS PERTE des notifications existantes (N1-A). Identifiants conservés ;
-- réversible par src/database/migrations/down/0052_notifications_core.down.sql.
--  * blog : cible = post ; data = { commentId, reviewId, metadata } (clés présentes seulement si non NULL) ;
--    is_read = true → read_at = created_at (aucune date de lecture n'existait).
--  * services : cible = service ; organisation reprise du service ; title / message conservés.
INSERT INTO "notifications" ("id","user_id","organization_id","module","type","category","actor_id","resource_type","resource_id","data","title","message","read_at","created_at","dedupe_key")
SELECT n."id", n."user_id", n."organization_id", 'blog', n."type",
  CASE WHEN n."type" IN ('NEW_REVIEW','REVIEW_APPROVED','REVIEW_REJECTED') THEN 'reviews'
       WHEN n."type" IN ('POST_PUBLISHED') THEN 'publishing'
       WHEN n."type" IN ('POST_MENTION') THEN 'mentions'
       ELSE 'comments' END,
  n."from_user_id", 'post', n."post_id",
  jsonb_strip_nulls(jsonb_build_object('commentId', n."comment_id", 'reviewId', n."review_id"))
    || CASE WHEN n."metadata" IS NOT NULL THEN jsonb_build_object('metadata', n."metadata") ELSE '{}'::jsonb END,
  NULL, NULL, CASE WHEN n."is_read" THEN n."created_at" END, n."created_at", NULL
FROM "blog_notifications" n;
--> statement-breakpoint
INSERT INTO "notifications" ("id","user_id","organization_id","module","type","category","actor_id","resource_type","resource_id","data","title","message","read_at","created_at","dedupe_key")
SELECT n."id", n."recipient_id", s."organization_id", 'services', n."type",
  CASE WHEN n."type" IN ('NEW_REVIEW','REVIEW_APPROVED','REVIEW_REJECTED') THEN 'reviews'
       WHEN n."type" IN ('SERVICE_PUBLISHED') THEN 'publishing'
       WHEN n."type" IN ('SERVICE_MENTION') THEN 'mentions'
       ELSE 'comments' END,
  n."actor_id", 'service', n."service_id",
  jsonb_strip_nulls(jsonb_build_object('commentId', n."comment_id", 'reviewId', n."review_id")),
  n."title", n."message", n."read_at", n."created_at", NULL
FROM "service_notifications" n JOIN "services" s ON s."id" = n."service_id";
--> statement-breakpoint
DROP TABLE "blog_notifications" CASCADE;--> statement-breakpoint
DROP TABLE "service_notifications" CASCADE;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_outbox_dedupe_uidx" ON "email_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "email_outbox_due_idx" ON "email_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "notifications_org_user_idx" ON "notifications" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "notifications_resource_idx" ON "notifications" USING btree ("module","resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uidx" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
-- Les anciennes tables supprimaient leurs notifications en cascade avec la ressource ciblée.
-- La table partagée n'a pas de FK vers les ressources de module : un déclencheur générique
-- conserve exactement cette sémantique (module, type de ressource, ou clé de data).
CREATE OR REPLACE FUNCTION notifications_cascade_resource() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_ARGV[2] = 'resource' THEN
    DELETE FROM "notifications" WHERE "module" = TG_ARGV[0] AND "resource_type" = TG_ARGV[1] AND "resource_id" = OLD."id";
  ELSE
    DELETE FROM "notifications" WHERE "module" = TG_ARGV[0] AND "data" ->> TG_ARGV[2] = OLD."id";
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "blog_posts_notifications_cascade" AFTER DELETE ON "blog_posts" FOR EACH ROW EXECUTE FUNCTION notifications_cascade_resource('blog', 'post', 'resource');
--> statement-breakpoint
CREATE TRIGGER "blog_comments_notifications_cascade" AFTER DELETE ON "blog_comments" FOR EACH ROW EXECUTE FUNCTION notifications_cascade_resource('blog', 'post', 'commentId');
--> statement-breakpoint
CREATE TRIGGER "blog_post_reviews_notifications_cascade" AFTER DELETE ON "blog_post_reviews" FOR EACH ROW EXECUTE FUNCTION notifications_cascade_resource('blog', 'post', 'reviewId');
--> statement-breakpoint
CREATE TRIGGER "services_notifications_cascade" AFTER DELETE ON "services" FOR EACH ROW EXECUTE FUNCTION notifications_cascade_resource('services', 'service', 'resource');
--> statement-breakpoint
CREATE TRIGGER "service_comments_notifications_cascade" AFTER DELETE ON "service_comments" FOR EACH ROW EXECUTE FUNCTION notifications_cascade_resource('services', 'service', 'commentId');
--> statement-breakpoint
CREATE TRIGGER "service_reviews_notifications_cascade" AFTER DELETE ON "service_reviews" FOR EACH ROW EXECUTE FUNCTION notifications_cascade_resource('services', 'service', 'reviewId');
