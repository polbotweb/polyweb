/**
 * Agrégat des notifications déclarées par les modules (registre core `notifications/registry`).
 * `pnpm module:new` ajoute automatiquement le module généré entre les marqueurs.
 */
import { registerNotificationDefinitions } from "@/core/notifications/registry";
import { blogNotifications } from "@/modules/blog/notifications/definitions";
import { servicesNotifications } from "@/modules/services/notifications/definitions";
import { salesNotifications } from "@/modules/sales/notifications/definitions";
// @module-notifications:imports

export const MODULE_NOTIFICATIONS = [
  blogNotifications,
  servicesNotifications,
  salesNotifications,
  // @module-notifications:list
] as const;

export function registerModuleNotifications(): void {
  for (const entry of MODULE_NOTIFICATIONS) registerNotificationDefinitions(entry);
}
