DROP TRIGGER IF EXISTS forum_posts_cascade ON forum_posts;
--> statement-breakpoint
DROP TRIGGER IF EXISTS forum_topics_cascade ON forum_topics;
--> statement-breakpoint
DROP FUNCTION IF EXISTS forums_cascade_target();
--> statement-breakpoint
DELETE FROM moderation_reports WHERE module = 'forums';
--> statement-breakpoint
DELETE FROM moderation_actions WHERE module = 'forums';
--> statement-breakpoint
DELETE FROM notifications WHERE module = 'forums';
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_sanctions";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_sanction_policies";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_topic_follows";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_topic_participants";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_poll_votes";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_poll_ballots";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_poll_options";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_polls";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_user_stats";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_reactions";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_votes";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_topic_tags";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_posts";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_topics";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_tags";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_categories";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_locks";
--> statement-breakpoint
DROP TABLE IF EXISTS "forum_revisions";
--> statement-breakpoint
DROP TABLE IF EXISTS "forums";
--> statement-breakpoint
DROP TABLE IF EXISTS "badge_awards";
