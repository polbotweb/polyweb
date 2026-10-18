-- Triggers/functions shared by Atomic DB.
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE
SECURITY INVOKER
AS $$
    SELECT nullif(current_setting('app.current_user_id', true), '');
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE
SECURITY INVOKER
AS $$
    SELECT coalesce(current_setting('app.is_admin', true)::boolean, false);
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION locale_to_regconfig(loc text) RETURNS regconfig AS $$
  SELECT CASE loc
    WHEN 'fr' THEN 'french'::regconfig
    WHEN 'en' THEN 'english'::regconfig
    WHEN 'es' THEN 'spanish'::regconfig
    ELSE 'simple'::regconfig
  END
$$ LANGUAGE sql IMMUTABLE STRICT;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION extract_jsonb_text(data jsonb) RETURNS text AS $$
  SELECT coalesce(string_agg(val #>> '{}', ' '), '')
  FROM jsonb_path_query(data, 'strict $.** ? (@.type() == "string")') AS val
$$ LANGUAGE sql IMMUTABLE STRICT;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION refresh_page_search_vector() RETURNS trigger AS $$
DECLARE
  target_page_id text;
  target_locale text;
  target_title text;
  target_meta_t text;
  target_meta_d text;
  target_slug text;
  section_text text;
  cfg regconfig;
BEGIN
  IF TG_TABLE_NAME = 'page_sections' THEN target_page_id := coalesce(NEW.page_id, OLD.page_id); ELSE target_page_id := coalesce(NEW.id, OLD.id); END IF;
  SELECT locale, title, meta_title, meta_description, slug INTO target_locale, target_title, target_meta_t, target_meta_d, target_slug FROM pages WHERE id = target_page_id;
  IF target_locale IS NULL THEN RETURN NULL; END IF;
  cfg := locale_to_regconfig(target_locale);
  SELECT regexp_replace(coalesce(string_agg(extract_jsonb_text(ps.content), ' '), ''), '<[^>]+>', ' ', 'g') INTO section_text FROM page_sections ps WHERE ps.page_id = target_page_id AND ps.is_visible = true;
  UPDATE pages SET search_vector =
    setweight(to_tsvector(cfg, coalesce(target_title, '')), 'A') ||
    setweight(to_tsvector(cfg, coalesce(target_meta_t, '')), 'B') ||
    setweight(to_tsvector(cfg, coalesce(target_meta_d, '')), 'B') ||
    setweight(to_tsvector(cfg, regexp_replace(coalesce(target_slug, ''), '-', ' ', 'g')), 'C') ||
    setweight(to_tsvector(cfg, coalesce(section_text, '')), 'D')
  WHERE id = target_page_id;
  RETURN NULL;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION refresh_blog_post_search_vector() RETURNS trigger AS $$
DECLARE cfg regconfig;
BEGIN
  cfg := locale_to_regconfig(NEW.locale);
  NEW.search_vector :=
    setweight(to_tsvector(cfg, coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector(cfg, coalesce(NEW.meta_title, '') || ' ' || coalesce(NEW.meta_description, '') || ' ' || coalesce(NEW.excerpt, '')), 'B') ||
    setweight(to_tsvector(cfg, regexp_replace(coalesce(NEW.slug, ''), '-', ' ', 'g')), 'C') ||
    setweight(to_tsvector(cfg, regexp_replace(coalesce(NEW.content, ''), '<[^>]+>', ' ', 'g')), 'D');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION refresh_service_search_vector() RETURNS trigger AS $$
DECLARE cfg regconfig;
BEGIN
  cfg := locale_to_regconfig(NEW.locale);
  NEW.search_vector :=
    setweight(to_tsvector(cfg, coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector(cfg, coalesce(NEW.meta_title, '') || ' ' || coalesce(NEW.meta_description, '') || ' ' || coalesce(NEW.excerpt, '')), 'B') ||
    setweight(to_tsvector(cfg, regexp_replace(coalesce(NEW.slug, ''), '-', ' ', 'g')), 'C') ||
    setweight(to_tsvector(cfg, regexp_replace(coalesce(NEW.content, ''), '<[^>]+>', ' ', 'g')), 'D');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
