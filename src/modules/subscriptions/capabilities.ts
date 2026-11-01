import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

/**
 * Une entrée par capacité ACTIVÉE dans `module.ts`.
 *
 * La valeur nomme la table ou l'action qui porte concrètement la capacité.
 * `assertModuleCapabilityProviders` refuse un module qui active une capacité
 * sans fournisseur : c'est le garde-fou qui empêche une déclaration fantaisiste.
 */
export const subscriptionsCapabilityProviders = {
  content: "subscriptions",
  localization: "subscriptionsTranslations",
  publication: "subscriptionsWorkflow",
  revisions: "subscription_revisions",
  locks: "subscription_locks",
} as unknown as PolywebModuleCapabilityProviders;
