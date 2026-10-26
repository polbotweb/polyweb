-- Tables auxiliaires des modules générés : préfixe de l'entité au SINGULIER (comme product_revisions / product_locks).
-- Uniquement des RENAME : aucune donnée copiée ni supprimée ; clés primaires, index, contraintes UNIQUE et FK renommés.
ALTER TABLE "events_revisions" RENAME TO "event_revisions";
--> statement-breakpoint
ALTER TABLE "events_locks" RENAME TO "event_locks";
--> statement-breakpoint
ALTER TABLE "formations_revisions" RENAME TO "formation_revisions";
--> statement-breakpoint
ALTER TABLE "formations_locks" RENAME TO "formation_locks";
--> statement-breakpoint
ALTER TABLE "courses_revisions" RENAME TO "course_revisions";
--> statement-breakpoint
ALTER TABLE "courses_locks" RENAME TO "course_locks";
--> statement-breakpoint
ALTER TABLE "event_revisions" RENAME CONSTRAINT "events_revisions_pkey" TO "event_revisions_pkey";
--> statement-breakpoint
ALTER TABLE "event_revisions" RENAME CONSTRAINT "events_revisions_resource_id_events_id_fk" TO "event_revisions_resource_id_events_id_fk";
--> statement-breakpoint
ALTER TABLE "event_revisions" RENAME CONSTRAINT "events_revisions_author_id_user_id_fk" TO "event_revisions_author_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "event_locks" RENAME CONSTRAINT "events_locks_pkey" TO "event_locks_pkey";
--> statement-breakpoint
ALTER TABLE "event_locks" RENAME CONSTRAINT "events_locks_resource_id_events_id_fk" TO "event_locks_resource_id_events_id_fk";
--> statement-breakpoint
ALTER TABLE "event_locks" RENAME CONSTRAINT "events_locks_user_id_user_id_fk" TO "event_locks_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "event_locks" RENAME CONSTRAINT "events_locks_resource_id_unique" TO "event_locks_resource_id_unique";
--> statement-breakpoint
ALTER TABLE "formation_revisions" RENAME CONSTRAINT "formations_revisions_pkey" TO "formation_revisions_pkey";
--> statement-breakpoint
ALTER TABLE "formation_revisions" RENAME CONSTRAINT "formations_revisions_resource_id_formations_id_fk" TO "formation_revisions_resource_id_formations_id_fk";
--> statement-breakpoint
ALTER TABLE "formation_revisions" RENAME CONSTRAINT "formations_revisions_author_id_user_id_fk" TO "formation_revisions_author_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "formation_locks" RENAME CONSTRAINT "formations_locks_pkey" TO "formation_locks_pkey";
--> statement-breakpoint
ALTER TABLE "formation_locks" RENAME CONSTRAINT "formations_locks_resource_id_formations_id_fk" TO "formation_locks_resource_id_formations_id_fk";
--> statement-breakpoint
ALTER TABLE "formation_locks" RENAME CONSTRAINT "formations_locks_user_id_user_id_fk" TO "formation_locks_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "formation_locks" RENAME CONSTRAINT "formations_locks_resource_id_unique" TO "formation_locks_resource_id_unique";
--> statement-breakpoint
ALTER TABLE "course_revisions" RENAME CONSTRAINT "courses_revisions_pkey" TO "course_revisions_pkey";
--> statement-breakpoint
ALTER TABLE "course_revisions" RENAME CONSTRAINT "courses_revisions_resource_id_courses_id_fk" TO "course_revisions_resource_id_courses_id_fk";
--> statement-breakpoint
ALTER TABLE "course_revisions" RENAME CONSTRAINT "courses_revisions_author_id_user_id_fk" TO "course_revisions_author_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "course_locks" RENAME CONSTRAINT "courses_locks_pkey" TO "course_locks_pkey";
--> statement-breakpoint
ALTER TABLE "course_locks" RENAME CONSTRAINT "courses_locks_resource_id_courses_id_fk" TO "course_locks_resource_id_courses_id_fk";
--> statement-breakpoint
ALTER TABLE "course_locks" RENAME CONSTRAINT "courses_locks_user_id_user_id_fk" TO "course_locks_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "course_locks" RENAME CONSTRAINT "courses_locks_resource_id_unique" TO "course_locks_resource_id_unique";
--> statement-breakpoint
ALTER INDEX "events_revisions_resource_idx" RENAME TO "event_revisions_resource_idx";
--> statement-breakpoint
ALTER INDEX "formations_revisions_resource_idx" RENAME TO "formation_revisions_resource_idx";
--> statement-breakpoint
ALTER INDEX "courses_revisions_resource_idx" RENAME TO "course_revisions_resource_idx";
