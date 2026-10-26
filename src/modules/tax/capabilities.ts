import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

/**
 * Une entrée par capacité ACTIVÉE dans `module.ts`.
 *
 * La valeur nomme la table ou l'action qui porte concrètement la capacité.
 * `assertModuleCapabilityProviders` refuse un module qui active une capacité
 * sans fournisseur : c'est le garde-fou qui empêche une déclaration fantaisiste.
 */
export const taxCapabilityProviders = {
  content: "tax_rates (taux de TVA par pays / catégorie / type de client)",
  publication: "taxWorkflow",
  revisions: "tax_rate_revisions",
  locks: "tax_rate_locks",
} as unknown as PolywebModuleCapabilityProviders;
