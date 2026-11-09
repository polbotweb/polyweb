/**
 * Notifications du module forums (registre core `notifications/registry`, docs/notifications.md).
 * Types déclarés ici, libellés dans `core/notifications/i18n` (`types["forums:TYPE"]`, 4 locales).
 * Envoi : `notify` (in-app, préférences) / `enqueueEmail` (outbox) depuis les services du module.
 * 3e et 4e arguments optionnels : gabarits e-mail (`EmailTemplate`) et sources de relance (`ReminderSource`).
 */
import { defineModuleNotifications } from "@/core/notifications/registry";

export const forumsNotifications = defineModuleNotifications("forums", [
  { type: "FORUMS_PUBLISHED", category: "publishing", channels: ["in_app"] },
]);
