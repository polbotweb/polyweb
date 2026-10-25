/**
 * Catégories des services : ADAPTATEUR du contrat générique `core/taxonomy` sur les tables
 * existantes (`service_categories`, `service_category_translations`, `service_category_links`).
 * Aucune migration, aucun déplacement de données : les actions historiques
 * (`src/actions/services/taxonomy.ts`) restent la voie d'écriture ; l'adaptateur sert la
 * lecture (arbre), le filtre et la facette « catégorie » de la liste admin.
 */
import { defineCategoryTaxonomy, registerCategoryTaxonomy } from "@/core/taxonomy/categories";
import { serviceCategories, serviceCategoryLinks, serviceCategoryTranslations, services } from "@database/schemas/services.schema";

export const servicesCategoryTaxonomy = registerCategoryTaxonomy(defineCategoryTaxonomy({
  resourceType: "services",
  categories: serviceCategories,
  translations: serviceCategoryTranslations,
  links: serviceCategoryLinks,
  linkResourceKey: "serviceId",
  linkCategoryKey: "categoryId",
  content: services,
}));
