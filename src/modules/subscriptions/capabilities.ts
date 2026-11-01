import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

/** Une entrée par capacité ACTIVÉE dans `module.ts` (table ou service qui la porte). */
export const subscriptionsCapabilityProviders = {
  content: "subscriptions + subscription_plans / subscription_prices",
  taxonomy: "subscription_categories (core/taxonomy, subscriptionsCategoryTaxonomy — catégories des formules)",
  audit: "logAuditEventEffect (SUBSCRIPTION_* : formules, tarifs, résiliation, reprise, changement de tarif)",
} as unknown as PolywebModuleCapabilityProviders;
