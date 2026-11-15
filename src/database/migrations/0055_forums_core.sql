CREATE TABLE "badge_awards" (
	"id" text PRIMARY KEY NOT NULL,
	"module" varchar(40) NOT NULL,
	"scope_id" text NOT NULL,
	"user_id" text NOT NULL,
	"badge" varchar(64) NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"forum_id" text NOT NULL,
	"slug" varchar(80) NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "forum_locks_resource_id_unique" UNIQUE("resource_id")
);
--> statement-breakpoint
CREATE TABLE "forum_poll_ballots" (
	"poll_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_poll_ballots_pkey" PRIMARY KEY("poll_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "forum_poll_options" (
	"id" text PRIMARY KEY NOT NULL,
	"poll_id" text NOT NULL,
	"label" varchar(120) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_poll_votes" (
	"poll_id" text NOT NULL,
	"option_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "forum_poll_votes_pkey" PRIMARY KEY("poll_id","user_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "forum_polls" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"question" varchar(200) NOT NULL,
	"multiple" boolean DEFAULT false NOT NULL,
	"results_visibility" varchar(16) DEFAULT 'always' NOT NULL,
	"closes_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_polls_topic_id_unique" UNIQUE("topic_id"),
	CONSTRAINT "forum_polls_results_check" CHECK ("forum_polls"."results_visibility" IN ('always', 'after_vote', 'after_close'))
);
--> statement-breakpoint
CREATE TABLE "forum_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"site_id" text NOT NULL,
	"organization_id" text,
	"author_id" text,
	"body" text NOT NULL,
	"body_html" text NOT NULL,
	"status" varchar(12) DEFAULT 'visible' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, coalesce("body", ''))) STORED,
	CONSTRAINT "forum_posts_status_check" CHECK ("forum_posts"."status" IN ('visible', 'hidden', 'spam'))
);
--> statement-breakpoint
CREATE TABLE "forum_reactions" (
	"target_type" varchar(8) NOT NULL,
	"target_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reaction" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_reactions_pkey" PRIMARY KEY("target_type","target_id","user_id","reaction")
);
--> statement-breakpoint
CREATE TABLE "forum_revisions" (
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
CREATE TABLE "forum_sanction_policies" (
	"site_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"window_days" integer DEFAULT 30 NOT NULL,
	"mute_threshold" integer DEFAULT 3 NOT NULL,
	"mute_hours" integer DEFAULT 24 NOT NULL,
	"suspend_threshold" integer DEFAULT 5 NOT NULL,
	"suspend_days" integer DEFAULT 7 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_sanction_policies_bounds" CHECK ("forum_sanction_policies"."window_days" BETWEEN 1 AND 365 AND "forum_sanction_policies"."mute_threshold" BETWEEN 1 AND 100 AND "forum_sanction_policies"."suspend_threshold" > "forum_sanction_policies"."mute_threshold" AND "forum_sanction_policies"."suspend_threshold" <= 200 AND "forum_sanction_policies"."mute_hours" BETWEEN 1 AND 720 AND "forum_sanction_policies"."suspend_days" BETWEEN 1 AND 365)
);
--> statement-breakpoint
CREATE TABLE "forum_sanctions" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"organization_id" text,
	"user_id" text NOT NULL,
	"kind" varchar(12) NOT NULL,
	"automatic" boolean DEFAULT true NOT NULL,
	"trigger_count" integer DEFAULT 0 NOT NULL,
	"note" text,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_by" text,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"revoke_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_sanctions_kind_check" CHECK ("forum_sanctions"."kind" IN ('mute', 'suspension')),
	CONSTRAINT "forum_sanctions_period_check" CHECK ("forum_sanctions"."ends_at" > "forum_sanctions"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "forum_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"slug" varchar(40) NOT NULL,
	"label" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_topic_follows" (
	"topic_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_topic_follows_pkey" PRIMARY KEY("topic_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "forum_topic_participants" (
	"topic_id" text NOT NULL,
	"user_id" text NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_topic_participants_pkey" PRIMARY KEY("topic_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "forum_topic_tags" (
	"topic_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "forum_topic_tags_pkey" PRIMARY KEY("topic_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "forum_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"forum_id" text NOT NULL,
	"category_id" text NOT NULL,
	"site_id" text NOT NULL,
	"organization_id" text,
	"author_id" text,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"body_html" text NOT NULL,
	"status" varchar(12) DEFAULT 'visible' NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"accepted_post_id" text,
	"last_post_at" timestamp with time zone DEFAULT now() NOT NULL,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, coalesce("title", '') || ' ' || coalesce("body", ''))) STORED,
	CONSTRAINT "forum_topics_status_check" CHECK ("forum_topics"."status" IN ('visible', 'hidden', 'spam'))
);
--> statement-breakpoint
CREATE TABLE "forum_user_stats" (
	"site_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reputation" integer DEFAULT 0 NOT NULL,
	"topics" integer DEFAULT 0 NOT NULL,
	"posts" integer DEFAULT 0 NOT NULL,
	"accepted_answers" integer DEFAULT 0 NOT NULL,
	"upvotes_received" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_user_stats_pkey" PRIMARY KEY("site_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "forum_votes" (
	"target_type" varchar(8) NOT NULL,
	"target_id" text NOT NULL,
	"user_id" text NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_votes_pkey" PRIMARY KEY("target_type","target_id","user_id"),
	CONSTRAINT "forum_votes_value_check" CHECK ("forum_votes"."value" IN (-1, 1)),
	CONSTRAINT "forum_votes_target_check" CHECK ("forum_votes"."target_type" IN ('topic', 'post'))
);
--> statement-breakpoint
CREATE TABLE "forums" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"site_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"visibility" varchar(16) DEFAULT 'public' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "forums_visibility_check" CHECK ("forums"."visibility" IN ('public', 'members', 'org'))
);
--> statement-breakpoint
ALTER TABLE "badge_awards" ADD CONSTRAINT "badge_awards_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_categories" ADD CONSTRAINT "forum_categories_forum_id_forums_id_fk" FOREIGN KEY ("forum_id") REFERENCES "public"."forums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_locks" ADD CONSTRAINT "forum_locks_resource_id_forums_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."forums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_locks" ADD CONSTRAINT "forum_locks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_poll_ballots" ADD CONSTRAINT "forum_poll_ballots_poll_id_forum_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."forum_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_poll_ballots" ADD CONSTRAINT "forum_poll_ballots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_poll_options" ADD CONSTRAINT "forum_poll_options_poll_id_forum_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."forum_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_poll_votes" ADD CONSTRAINT "forum_poll_votes_poll_id_forum_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."forum_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_poll_votes" ADD CONSTRAINT "forum_poll_votes_option_id_forum_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."forum_poll_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_poll_votes" ADD CONSTRAINT "forum_poll_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_polls" ADD CONSTRAINT "forum_polls_topic_id_forum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."forum_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_topic_id_forum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."forum_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_reactions" ADD CONSTRAINT "forum_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_revisions" ADD CONSTRAINT "forum_revisions_resource_id_forums_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."forums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_revisions" ADD CONSTRAINT "forum_revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_sanction_policies" ADD CONSTRAINT "forum_sanction_policies_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_sanction_policies" ADD CONSTRAINT "forum_sanction_policies_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_sanctions" ADD CONSTRAINT "forum_sanctions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_sanctions" ADD CONSTRAINT "forum_sanctions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_sanctions" ADD CONSTRAINT "forum_sanctions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_sanctions" ADD CONSTRAINT "forum_sanctions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_sanctions" ADD CONSTRAINT "forum_sanctions_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_tags" ADD CONSTRAINT "forum_tags_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topic_follows" ADD CONSTRAINT "forum_topic_follows_topic_id_forum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."forum_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topic_follows" ADD CONSTRAINT "forum_topic_follows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topic_participants" ADD CONSTRAINT "forum_topic_participants_topic_id_forum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."forum_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topic_participants" ADD CONSTRAINT "forum_topic_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topic_participants" ADD CONSTRAINT "forum_topic_participants_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topic_tags" ADD CONSTRAINT "forum_topic_tags_topic_id_forum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."forum_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topic_tags" ADD CONSTRAINT "forum_topic_tags_tag_id_forum_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."forum_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topics" ADD CONSTRAINT "forum_topics_forum_id_forums_id_fk" FOREIGN KEY ("forum_id") REFERENCES "public"."forums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topics" ADD CONSTRAINT "forum_topics_category_id_forum_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."forum_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topics" ADD CONSTRAINT "forum_topics_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topics" ADD CONSTRAINT "forum_topics_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topics" ADD CONSTRAINT "forum_topics_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_user_stats" ADD CONSTRAINT "forum_user_stats_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_user_stats" ADD CONSTRAINT "forum_user_stats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_votes" ADD CONSTRAINT "forum_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forums" ADD CONSTRAINT "forums_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forums" ADD CONSTRAINT "forums_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forums" ADD CONSTRAINT "forums_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "badge_awards_unique_uidx" ON "badge_awards" USING btree ("module","scope_id","user_id","badge");--> statement-breakpoint
CREATE INDEX "badge_awards_user_idx" ON "badge_awards" USING btree ("user_id","module","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "forum_categories_forum_slug_uidx" ON "forum_categories" USING btree ("forum_id","slug");--> statement-breakpoint
CREATE INDEX "forum_categories_order_idx" ON "forum_categories" USING btree ("forum_id","position");--> statement-breakpoint
CREATE INDEX "forum_poll_options_poll_idx" ON "forum_poll_options" USING btree ("poll_id","position");--> statement-breakpoint
CREATE INDEX "forum_poll_votes_option_idx" ON "forum_poll_votes" USING btree ("option_id");--> statement-breakpoint
CREATE INDEX "forum_posts_topic_idx" ON "forum_posts" USING btree ("topic_id","status","created_at");--> statement-breakpoint
CREATE INDEX "forum_posts_author_idx" ON "forum_posts" USING btree ("author_id","site_id","moderated_at");--> statement-breakpoint
CREATE INDEX "forum_posts_search_idx" ON "forum_posts" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "forum_reactions_target_idx" ON "forum_reactions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "forum_revisions_resource_idx" ON "forum_revisions" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "forum_sanctions_active_idx" ON "forum_sanctions" USING btree ("site_id","user_id","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "forum_tags_site_slug_uidx" ON "forum_tags" USING btree ("site_id","slug");--> statement-breakpoint
CREATE INDEX "forum_topic_follows_user_idx" ON "forum_topic_follows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "forum_topic_participants_user_idx" ON "forum_topic_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "forum_topic_tags_tag_idx" ON "forum_topic_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "forum_topics_list_idx" ON "forum_topics" USING btree ("forum_id","status","pinned","last_post_at");--> statement-breakpoint
CREATE INDEX "forum_topics_category_idx" ON "forum_topics" USING btree ("category_id","status","last_post_at");--> statement-breakpoint
CREATE INDEX "forum_topics_author_idx" ON "forum_topics" USING btree ("author_id","site_id","moderated_at");--> statement-breakpoint
CREATE INDEX "forum_topics_search_idx" ON "forum_topics" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "forums_site_slug_uidx" ON "forums" USING btree ("site_id","slug");--> statement-breakpoint
CREATE INDEX "forums_org_idx" ON "forums" USING btree ("organization_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION forums_cascade_target() RETURNS trigger AS $$
DECLARE kind text := TG_ARGV[0];
BEGIN
  DELETE FROM forum_votes WHERE target_type = kind AND target_id = OLD.id;
  DELETE FROM forum_reactions WHERE target_type = kind AND target_id = OLD.id;
  DELETE FROM moderation_reports WHERE module = 'forums' AND target_type = kind AND target_id = OLD.id;
  DELETE FROM moderation_actions WHERE module = 'forums' AND target_type = kind AND target_id = OLD.id;
  IF kind = 'post' THEN
    UPDATE forum_topics SET accepted_post_id = NULL WHERE accepted_post_id = OLD.id;
  END IF;
  RETURN OLD;
END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS forum_topics_cascade ON forum_topics;
--> statement-breakpoint
CREATE TRIGGER forum_topics_cascade AFTER DELETE ON forum_topics FOR EACH ROW EXECUTE FUNCTION forums_cascade_target('topic');
--> statement-breakpoint
DROP TRIGGER IF EXISTS forum_posts_cascade ON forum_posts;
--> statement-breakpoint
CREATE TRIGGER forum_posts_cascade AFTER DELETE ON forum_posts FOR EACH ROW EXECUTE FUNCTION forums_cascade_target('post');
