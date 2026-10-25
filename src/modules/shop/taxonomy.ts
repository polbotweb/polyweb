/**
 * Catégories du domaine shop : adhésion au contrat générique `core/taxonomy`
 * (tables propres `product_categories`, `product_category_translations`, `product_category_links`).
 * Actions : `shop.categories.*` (gardes tenant-aware, permission `shop:update`).
 */
import { defineCategoryTaxonomy, registerCategoryTaxonomy } from "@/core/taxonomy/categories";
import { shop, productCategories, productCategoryLinks, productCategoryTranslations } from "./schema";

export const shopCategoryTaxonomy = registerCategoryTaxonomy(defineCategoryTaxonomy({
  resourceType: "shop",
  categories: productCategories,
  translations: productCategoryTranslations,
  links: productCategoryLinks,
  linkResourceKey: "productId",
  linkCategoryKey: "categoryId",
  content: shop,
}));
