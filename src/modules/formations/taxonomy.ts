/**
 * Catégories du domaine formations : adhésion au contrat générique `core/taxonomy`
 * (tables propres `formation_categories`, `formation_category_translations`, `formation_category_links`).
 * Actions : `formations.categories.*` (gardes tenant-aware, permission `formations:update`).
 */
import { defineCategoryTaxonomy, registerCategoryTaxonomy } from "@/core/taxonomy/categories";
import { formations, formationCategories, formationCategoryLinks, formationCategoryTranslations } from "./schema";

export const formationsCategoryTaxonomy = registerCategoryTaxonomy(defineCategoryTaxonomy({
  resourceType: "formations",
  categories: formationCategories,
  translations: formationCategoryTranslations,
  links: formationCategoryLinks,
  linkResourceKey: "formationId",
  linkCategoryKey: "categoryId",
  content: formations,
}));
