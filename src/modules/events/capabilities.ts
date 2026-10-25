import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

/**
 * Une entrée par capacité ACTIVÉE dans `module.ts`.
 *
 * La valeur nomme la table ou l'action qui porte concrètement la capacité.
 * `assertModuleCapabilityProviders` refuse un module qui active une capacité
 * sans fournisseur : c'est le garde-fou qui empêche une déclaration fantaisiste.
 */
export const eventsCapabilityProviders = {
  content: "events",
  localization: "eventsTranslations",
  publication: "eventsWorkflow",
  revisions: "events_revisions",
  locks: "events_locks",
} as unknown as PolywebModuleCapabilityProviders;
