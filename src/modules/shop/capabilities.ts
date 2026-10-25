import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

/**
 * Une entrée par capacité ACTIVÉE dans `module.ts`.
 *
 * La valeur nomme la table ou l'action qui porte concrètement la capacité.
 * `assertModuleCapabilityProviders` refuse un module qui active une capacité
 * sans fournisseur : c'est le garde-fou qui empêche une déclaration fantaisiste.
 */
export const shopCapabilityProviders = {
  content: "shop",
  media: "media_files (shop_products.cover_image_id)",
  localization: "product_translations",
  taxonomy: "product_categories (core/taxonomy, shopCategoryTaxonomy)",
  publication: "shopWorkflow",
  revisions: "shop_revisions",
  locks: "shop_locks",
} as unknown as PolywebModuleCapabilityProviders;
