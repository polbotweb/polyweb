-- Renommage non destructif des tables Shop (shop_* → products / product_revisions / product_locks).
-- Uniquement des RENAME : aucune donnée copiée ni supprimée ; clés primaires, index, contraintes UNIQUE et FK renommés.
ALTER TABLE "shop_products" RENAME TO "products";
--> statement-breakpoint
ALTER TABLE "shop_revisions" RENAME TO "product_revisions";
--> statement-breakpoint
ALTER TABLE "shop_locks" RENAME TO "product_locks";
--> statement-breakpoint
ALTER TABLE "products" RENAME CONSTRAINT "shop_products_pkey" TO "products_pkey";
--> statement-breakpoint
ALTER TABLE "product_revisions" RENAME CONSTRAINT "shop_revisions_pkey" TO "product_revisions_pkey";
--> statement-breakpoint
ALTER TABLE "product_locks" RENAME CONSTRAINT "shop_locks_pkey" TO "product_locks_pkey";
--> statement-breakpoint
ALTER TABLE "product_locks" RENAME CONSTRAINT "shop_locks_resource_id_unique" TO "product_locks_resource_id_unique";
--> statement-breakpoint
ALTER TABLE "products" RENAME CONSTRAINT "shop_products_organization_id_organization_id_fk" TO "products_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "products" RENAME CONSTRAINT "shop_products_cover_image_id_media_files_id_fk" TO "products_cover_image_id_media_files_id_fk";
--> statement-breakpoint
ALTER TABLE "products" RENAME CONSTRAINT "shop_products_created_by_user_id_fk" TO "products_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "product_revisions" RENAME CONSTRAINT "shop_revisions_resource_id_shop_products_id_fk" TO "product_revisions_resource_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "product_revisions" RENAME CONSTRAINT "shop_revisions_author_id_user_id_fk" TO "product_revisions_author_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "product_locks" RENAME CONSTRAINT "shop_locks_resource_id_shop_products_id_fk" TO "product_locks_resource_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "product_locks" RENAME CONSTRAINT "shop_locks_user_id_user_id_fk" TO "product_locks_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "product_translations" RENAME CONSTRAINT "product_translations_product_id_shop_products_id_fk" TO "product_translations_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "product_options" RENAME CONSTRAINT "product_options_product_id_shop_products_id_fk" TO "product_options_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "product_variants" RENAME CONSTRAINT "product_variants_product_id_shop_products_id_fk" TO "product_variants_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "product_category_links" RENAME CONSTRAINT "product_category_links_product_id_shop_products_id_fk" TO "product_category_links_product_id_products_id_fk";
--> statement-breakpoint
ALTER INDEX "shop_org_slug_uidx" RENAME TO "products_org_slug_uidx";
--> statement-breakpoint
ALTER INDEX "shop_products_org_idx" RENAME TO "products_org_idx";
--> statement-breakpoint
ALTER INDEX "shop_products_status_idx" RENAME TO "products_status_idx";
--> statement-breakpoint
ALTER INDEX "shop_revisions_resource_idx" RENAME TO "product_revisions_resource_idx";
