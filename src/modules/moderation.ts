/**
 * Agrégat des cibles de modération déclarées par les modules (registre core `moderation/registry`).
 * `pnpm module:new` ajoute automatiquement le module généré entre les marqueurs.
 */
import { registerEventNames } from "@/core/events";
import { registerModuleModeration } from "@/core/moderation/registry";
import { MODERATION_DECIDED_EVENT } from "@/core/moderation/service";
import { MESSAGING_MESSAGE_CREATED_EVENT } from "@/core/messaging/service";
import { blogModeration } from "@/modules/blog/moderation/adapters";
import { messagingModeration } from "@/modules/messaging/moderation/adapters";
import { servicesModeration } from "@/modules/services/moderation/adapters";
// @module-moderation:imports

export const MODULE_MODERATION = [
  blogModeration,
  servicesModeration,
  messagingModeration,
  // @module-moderation:list
] as const;

let registered = false;

/** Idempotent : appelé au démarrage (bootstrap) et par les actions de modération. */
export function registerModerationTargets(): void {
  if (registered) return;
  registered = true;
  registerEventNames([
    { name: MODERATION_DECIDED_EVENT, module: "core", description: "Décision de modération (masquer, rétablir, spam) sur un contenu." },
    { name: MESSAGING_MESSAGE_CREATED_EVENT, module: "messaging", description: "Nouveau message privé (sans corps)." },
  ]);
  for (const entry of MODULE_MODERATION) registerModuleModeration(entry);
}
