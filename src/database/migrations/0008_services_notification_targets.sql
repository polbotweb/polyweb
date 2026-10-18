ALTER TABLE "service_notifications" DROP CONSTRAINT IF EXISTS "service_notification_target_consistency";
--> statement-breakpoint
ALTER TABLE "service_notifications" ADD CONSTRAINT "service_notification_target_consistency" CHECK (
  CASE
    WHEN "type" IN ('NEW_COMMENT','REPLY_TO_COMMENT') THEN "comment_id" IS NOT NULL AND "review_id" IS NULL
    WHEN "type" IN ('NEW_REVIEW','REVIEW_APPROVED','REVIEW_REJECTED') THEN "review_id" IS NOT NULL AND "comment_id" IS NULL
    WHEN "type" IN ('SERVICE_PUBLISHED','SERVICE_MENTION') THEN "comment_id" IS NULL AND "review_id" IS NULL
    ELSE FALSE
  END
);
