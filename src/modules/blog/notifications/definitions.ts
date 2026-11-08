/** Notifications du module blog (créées directement par les actions de modération). */
import { defineModuleNotifications } from "@/core/notifications/registry";

export const blogNotifications = defineModuleNotifications("blog", [
  { type: "NEW_COMMENT", category: "comments", channels: ["in_app"] },
  { type: "REPLY_TO_COMMENT", category: "comments", channels: ["in_app"] },
  { type: "COMMENT_APPROVED", category: "comments", channels: ["in_app"] },
  { type: "COMMENT_REJECTED", category: "comments", channels: ["in_app"] },
  { type: "NEW_REVIEW", category: "reviews", channels: ["in_app"] },
  { type: "REVIEW_APPROVED", category: "reviews", channels: ["in_app"] },
  { type: "POST_PUBLISHED", category: "publishing", channels: ["in_app"] },
  { type: "POST_MENTION", category: "mentions", channels: ["in_app"] },
]);
