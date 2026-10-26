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
  media: "media_files (events.cover_image_id)",
  localization: "event_translations",
  taxonomy: "event_categories (core/taxonomy, eventsCategoryTaxonomy)",
  publication: "eventsWorkflow",
  revisions: "event_revisions",
  locks: "event_locks",
} as unknown as PolywebModuleCapabilityProviders;
