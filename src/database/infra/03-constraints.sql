-- Phase 1 : ajout NOT VALID (instantané, pas de scan de table, pas de verrou exclusif).
-- Phase 2 : VALIDATE CONSTRAINT (scan sans verrou exclusif, safe en production).
-- Idempotent : vérifie existence de la table ET de la contrainte avant chaque opération.

DO $$
BEGIN
    IF to_regclass('contact_info') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_info_email_format_chk')
    THEN
        ALTER TABLE contact_info
        ADD CONSTRAINT contact_info_email_format_chk
        CHECK (email IS NULL OR email ~* '^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,63}$')
        NOT VALID;
    END IF;

    IF to_regclass('opening_hours') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opening_hours_time_consistency_chk')
    THEN
        ALTER TABLE opening_hours
        ADD CONSTRAINT opening_hours_time_consistency_chk
        CHECK (
            is_closed
            OR (NOT has_midday_break AND (open_time IS NULL OR close_time IS NULL OR open_time < close_time))
            OR (has_midday_break AND open_time < close_time)
        )
        NOT VALID;
    END IF;
END $$;
--> statement-breakpoint

-- Validation différée : scanne les lignes existantes.
-- Si des lignes violent la contrainte, cette étape échoue proprement
-- sans retirer la contrainte (elle reste NOT VALID).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'contact_info_email_format_chk' AND NOT convalidated
    ) THEN
        EXECUTE 'ALTER TABLE contact_info VALIDATE CONSTRAINT contact_info_email_format_chk';
        RAISE NOTICE 'contact_info_email_format_chk validée';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'opening_hours_time_consistency_chk' AND NOT convalidated
    ) THEN
        EXECUTE 'ALTER TABLE opening_hours VALIDATE CONSTRAINT opening_hours_time_consistency_chk';
        RAISE NOTICE 'opening_hours_time_consistency_chk validée';
    END IF;
END $$;
