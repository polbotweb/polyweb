import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

/**
 * Une entrée par capacité ACTIVÉE dans `module.ts`.
 *
 * La valeur nomme la table ou l'action qui porte concrètement la capacité.
 * `assertModuleCapabilityProviders` refuse un module qui active une capacité
 * sans fournisseur : c'est le garde-fou qui empêche une déclaration fantaisiste.
 */
export const forumsCapabilityProviders = {
  content: "forums",
  localization: "forum_categories.translations",
  publication: "forumsWorkflow",
  revisions: "forum_revisions",
  locks: "forum_locks",
  engagement: "forum_votes",
  moderation: "forumsModeration",
  notifications: "forumsNotifications",
  audit: "forumsAudit",
} as unknown as PolywebModuleCapabilityProviders;
