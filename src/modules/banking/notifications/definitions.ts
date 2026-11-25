/**
 * Notifications du module banking (registre core `notifications/registry`, docs/notifications.md).
 * Libellés dans `core/notifications/i18n` (`types["banking:TYPE"]`, 4 locales), catégorie « banking ».
 * Destinataires : rôles réglés par organisation (propriétaires et administrateurs par défaut),
 * chaque type activable dans les réglages banking ; préférences utilisateur respectées par `notify`.
 */
import { defineModuleNotifications } from "@/core/notifications/registry";
import type { BankingNotificationKind } from "../domain/constants";

export const BANKING_NOTIFICATION_TYPES: Readonly<Record<BankingNotificationKind, string>> = {
  importDone: "IMPORT_DONE",
  importFailed: "IMPORT_FAILED",
  continuityBreak: "CONTINUITY_BREAK",
  dailyDigest: "DAILY_DIGEST",
  aging: "AGING",
  writeOffApproval: "WRITE_OFF_APPROVAL",
  sepaReturn: "SEPA_RETURN",
  feedError: "FEED_ERROR",
};

export const bankingNotifications = defineModuleNotifications(
  "banking",
  Object.values(BANKING_NOTIFICATION_TYPES).map((type) => ({ type, category: "banking", channels: ["in_app"] as const })),
);
