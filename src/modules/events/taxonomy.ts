/**
 * Catégories du domaine events : adhésion au contrat générique `core/taxonomy`
 * (tables propres `event_categories`, `event_category_translations`, `event_category_links`).
 * Actions : `events.categories.*` (gardes tenant-aware, permission `events:update`).
 */
import { defineCategoryTaxonomy, registerCategoryTaxonomy } from "@/core/taxonomy/categories";
import { events, eventCategories, eventCategoryLinks, eventCategoryTranslations } from "./schema";

export const eventsCategoryTaxonomy = registerCategoryTaxonomy(defineCategoryTaxonomy({
  resourceType: "events",
  categories: eventCategories,
  translations: eventCategoryTranslations,
  links: eventCategoryLinks,
  linkResourceKey: "eventId",
  linkCategoryKey: "categoryId",
  content: events,
}));
