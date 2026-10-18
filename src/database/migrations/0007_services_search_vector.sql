ALTER TABLE "service_translations"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "atomic_service_locale_regconfig"(locale text)
RETURNS regconfig
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE locale
    WHEN 'fr' THEN 'french'::regconfig
    WHEN 'en' THEN 'english'::regconfig
    WHEN 'es' THEN 'spanish'::regconfig
    ELSE 'simple'::regconfig
  END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "atomic_service_translation_search_vector"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."search_vector" :=
    setweight(to_tsvector("atomic_service_locale_regconfig"(NEW."locale"), coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector("atomic_service_locale_regconfig"(NEW."locale"), coalesce(NEW."excerpt", '')), 'B') ||
    setweight(to_tsvector("atomic_service_locale_regconfig"(NEW."locale"), coalesce(NEW."content", '')), 'C');
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "atomic_service_translation_search_vector_trg"
  ON "service_translations";
--> statement-breakpoint

CREATE TRIGGER "atomic_service_translation_search_vector_trg"
BEFORE INSERT OR UPDATE OF "locale", "title", "excerpt", "content"
ON "service_translations"
FOR EACH ROW
EXECUTE FUNCTION "atomic_service_translation_search_vector"();
--> statement-breakpoint

UPDATE "service_translations"
SET "search_vector" =
  setweight(to_tsvector("atomic_service_locale_regconfig"("locale"), coalesce("title", '')), 'A') ||
  setweight(to_tsvector("atomic_service_locale_regconfig"("locale"), coalesce("excerpt", '')), 'B') ||
  setweight(to_tsvector("atomic_service_locale_regconfig"("locale"), coalesce("content", '')), 'C');
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "service_translations_search_vector_gin_idx"
  ON "service_translations"
  USING gin ("search_vector");
