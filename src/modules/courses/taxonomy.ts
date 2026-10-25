/**
 * Catégories du domaine courses : adhésion au contrat générique `core/taxonomy`
 * (tables propres `course_categories`, `course_category_translations`, `course_category_links`).
 * Actions : `courses.categories.*` (gardes tenant-aware, permission `courses:update`).
 */
import { defineCategoryTaxonomy, registerCategoryTaxonomy } from "@/core/taxonomy/categories";
import { courses, courseCategories, courseCategoryLinks, courseCategoryTranslations } from "./schema";

export const coursesCategoryTaxonomy = registerCategoryTaxonomy(defineCategoryTaxonomy({
  resourceType: "courses",
  categories: courseCategories,
  translations: courseCategoryTranslations,
  links: courseCategoryLinks,
  linkResourceKey: "courseId",
  linkCategoryKey: "categoryId",
  content: courses,
}));
