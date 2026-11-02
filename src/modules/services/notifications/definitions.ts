/** Notifications du module services (créées par `createServiceNotification`). */
import { defineModuleNotifications } from "@/core/notifications/registry";

export const servicesNotifications = defineModuleNotifications("services", [
  { type: "NEW_COMMENT", category: "comments", channels: ["in_app"] },
  { type: "REPLY_TO_COMMENT", category: "comments", channels: ["in_app"] },
  { type: "NEW_REVIEW", category: "reviews", channels: ["in_app"] },
  { type: "REVIEW_APPROVED", category: "reviews", channels: ["in_app"] },
  { type: "REVIEW_REJECTED", category: "reviews", channels: ["in_app"] },
  { type: "SERVICE_PUBLISHED", category: "publishing", channels: ["in_app"] },
  { type: "SERVICE_MENTION", category: "mentions", channels: ["in_app"] },
]);
