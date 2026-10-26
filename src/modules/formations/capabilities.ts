import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

/**
 * Une entrée par capacité ACTIVÉE dans `module.ts`.
 *
 * La valeur nomme la table ou l'action qui porte concrètement la capacité.
 * `assertModuleCapabilityProviders` refuse un module qui active une capacité
 * sans fournisseur : c'est le garde-fou qui empêche une déclaration fantaisiste.
 */
export const formationsCapabilityProviders = {
  content: "formations",
  media: "media_files (formations.cover_image_id)",
  localization: "formation_translations",
  taxonomy: "formation_categories (core/taxonomy, formationsCategoryTaxonomy)",
  publication: "formationsWorkflow",
  revisions: "formation_revisions",
  locks: "formation_locks",
} as unknown as PolywebModuleCapabilityProviders;
