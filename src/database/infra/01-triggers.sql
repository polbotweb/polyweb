-- Triggers updated_at automatiques.
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('"user"', 'trigger_user_updated_at'),
            ('organization', 'trigger_organization_updated_at'),
            ('navigation_menus', 'trigger_navigation_menus_updated_at'),
            ('navigation_items', 'trigger_navigation_items_updated_at'),
            ('pages', 'trigger_pages_updated_at'),
            ('page_sections', 'trigger_page_sections_updated_at'),
            ('site_settings', 'trigger_site_settings_updated_at'),
            ('social_links', 'trigger_social_links_updated_at'),
            ('contact_info', 'trigger_contact_info_updated_at'),
            ('opening_hours', 'trigger_opening_hours_updated_at'),
            ('theme_settings', 'trigger_theme_settings_updated_at')
        ) AS t(tbl, trig)
    LOOP
        IF to_regclass(r.tbl) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = r.trig) THEN
            EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', r.trig, r.tbl);
        END IF;
    END LOOP;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF to_regclass('pages') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pages_search_vector_update') THEN
        CREATE TRIGGER pages_search_vector_update AFTER INSERT OR UPDATE OF title, meta_title, meta_description, slug, locale ON pages FOR EACH ROW EXECUTE FUNCTION refresh_page_search_vector();
    END IF;
    IF to_regclass('page_sections') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'page_sections_search_vector_update') THEN
        CREATE TRIGGER page_sections_search_vector_update AFTER INSERT OR UPDATE OR DELETE ON page_sections FOR EACH ROW EXECUTE FUNCTION refresh_page_search_vector();
    END IF;
    IF to_regclass('blog_post_translations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'blog_post_translations_search_vector_update') THEN
        CREATE TRIGGER blog_post_translations_search_vector_update BEFORE INSERT OR UPDATE OF title, slug, excerpt, meta_title, meta_description, content, locale ON blog_post_translations FOR EACH ROW EXECUTE FUNCTION refresh_blog_post_search_vector();
    END IF;
    IF to_regclass('service_translations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'service_translations_search_vector_update') THEN
        CREATE TRIGGER service_translations_search_vector_update BEFORE INSERT OR UPDATE OF title, slug, excerpt, meta_title, meta_description, content, locale ON service_translations FOR EACH ROW EXECUTE FUNCTION refresh_service_search_vector();
    END IF;
END $$;
