-- Indexes complémentaires aux indexes Drizzle.
CREATE INDEX IF NOT EXISTS audit_log_user_created_at_idx ON audit_log (user_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_log_action_created_at_idx ON audit_log (action, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_log_resource_created_at_idx ON audit_log (resource, resource_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS navigation_items_menu_locale_active_sort_idx ON navigation_items (menu_id, locale, is_active, sort_order);
--> statement-breakpoint

ALTER TABLE pages ADD COLUMN IF NOT EXISTS search_vector tsvector;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pages_search_vector_idx ON pages USING GIN (search_vector);
--> statement-breakpoint
ALTER TABLE blog_post_translations ADD COLUMN IF NOT EXISTS search_vector tsvector;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS blog_post_translations_search_vector_idx ON blog_post_translations USING GIN (search_vector);
--> statement-breakpoint
UPDATE blog_post_translations SET title = title WHERE search_vector IS NULL;
--> statement-breakpoint

ALTER TABLE service_translations ADD COLUMN IF NOT EXISTS search_vector tsvector;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS service_translations_search_vector_idx ON service_translations USING GIN (search_vector);
--> statement-breakpoint
UPDATE service_translations SET title = title WHERE search_vector IS NULL;
