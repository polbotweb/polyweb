ALTER TABLE "pages" DROP CONSTRAINT "pages_locked_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN "locked_by";--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN "locked_at";