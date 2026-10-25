import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

/**
 * Une entrée par capacité ACTIVÉE dans `module.ts`.
 *
 * La valeur nomme la table ou l'action qui porte concrètement la capacité.
 * `assertModuleCapabilityProviders` refuse un module qui active une capacité
 * sans fournisseur : c'est le garde-fou qui empêche une déclaration fantaisiste.
 */
export const coursesCapabilityProviders = {
  content: "courses",
  media: "media_files (courses.cover_image_id)",
  localization: "course_translations",
  taxonomy: "course_categories (core/taxonomy, coursesCategoryTaxonomy)",
  publication: "coursesWorkflow",
  revisions: "courses_revisions",
  locks: "courses_locks",
} as unknown as PolywebModuleCapabilityProviders;
