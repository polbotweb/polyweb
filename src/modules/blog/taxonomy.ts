/**
 * Catégories du blog : ADAPTATEUR du contrat générique `core/taxonomy` sur les tables
 * existantes (`blog_categories`, `blog_category_translations`, `blog_post_categories`).
 * Aucune migration, aucun déplacement de données : les actions historiques du blog
 * (`src/actions/blog/category.ts`) restent la voie d'écriture ; l'adaptateur sert la
 * lecture (arbre), le filtre et la facette « catégorie » de la liste admin.
 */
import { defineCategoryTaxonomy, registerCategoryTaxonomy } from "@/core/taxonomy/categories";
import { blogCategories, blogCategoryTranslations, blogPostCategories, blogPosts } from "./schema";

export const blogCategoryTaxonomy = registerCategoryTaxonomy(defineCategoryTaxonomy({
  resourceType: "blog",
  categories: blogCategories,
  translations: blogCategoryTranslations,
  links: blogPostCategories,
  linkResourceKey: "postId",
  linkCategoryKey: "categoryId",
  content: blogPosts,
}));
