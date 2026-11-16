DROP TRIGGER IF EXISTS classified_ads_cascade ON classified_ads;
--> statement-breakpoint
DROP TRIGGER IF EXISTS classified_categories_cascade ON classified_categories;
--> statement-breakpoint
DROP FUNCTION IF EXISTS classifieds_cascade_ad();
--> statement-breakpoint
DROP FUNCTION IF EXISTS classifieds_cascade_category();
--> statement-breakpoint
DELETE FROM moderation_reports WHERE module = 'classifieds';
--> statement-breakpoint
DELETE FROM moderation_actions WHERE module = 'classifieds';
--> statement-breakpoint
DELETE FROM notifications WHERE module = 'classifieds';
--> statement-breakpoint
DROP TABLE IF EXISTS "classified_inquiries";
--> statement-breakpoint
DROP TABLE IF EXISTS "classified_saved_search_filters";
--> statement-breakpoint
DROP TABLE IF EXISTS "classified_saved_searches";
--> statement-breakpoint
DROP TABLE IF EXISTS "classified_favorites";
--> statement-breakpoint
DROP TABLE IF EXISTS "classified_ad_media";
--> statement-breakpoint
DROP TABLE IF EXISTS "classified_ads";
--> statement-breakpoint
DROP TABLE IF EXISTS "classified_category_translations";
--> statement-breakpoint
DROP TABLE IF EXISTS "classified_categories";
--> statement-breakpoint
DROP TABLE IF EXISTS "classified_site_settings";
--> statement-breakpoint
DROP TABLE IF EXISTS "attribute_value_options";
--> statement-breakpoint
DROP TABLE IF EXISTS "attribute_values";
--> statement-breakpoint
DROP TABLE IF EXISTS "attribute_option_translations";
--> statement-breakpoint
DROP TABLE IF EXISTS "attribute_options";
--> statement-breakpoint
DROP TABLE IF EXISTS "attribute_definition_translations";
--> statement-breakpoint
DROP TABLE IF EXISTS "attribute_definitions";
