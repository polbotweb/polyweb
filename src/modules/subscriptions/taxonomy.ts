/**
 * Catégories du domaine subscriptions : adhésion au contrat générique `core/taxonomy`
 * (tables propres `subscription_categories`, `subscription_category_translations`, `subscription_category_links`).
 * Les catégories classent les FORMULES (`subscription_plans`) : c'est l'objet catalogue du module.
 * Actions : `subscriptions.categories.*` (gardes tenant-aware, permission `subscriptions:update`).
 */
import { defineCategoryTaxonomy, registerCategoryTaxonomy } from "@/core/taxonomy/categories";
import { subscriptionPlans, subscriptionCategories, subscriptionCategoryLinks, subscriptionCategoryTranslations } from "./schema";

export const subscriptionsCategoryTaxonomy = registerCategoryTaxonomy(defineCategoryTaxonomy({
  resourceType: "subscriptions",
  categories: subscriptionCategories,
  translations: subscriptionCategoryTranslations,
  links: subscriptionCategoryLinks,
  linkResourceKey: "planId",
  linkCategoryKey: "categoryId",
  content: subscriptionPlans,
}));
