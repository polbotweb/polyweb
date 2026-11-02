ALTER TABLE "audit_log" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "site_id" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "module" varchar(64);--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "outcome" varchar(16) DEFAULT 'success' NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_log_org_created_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
-- Journal d'audit append-only (C5-A) : ni UPDATE ni DELETE, sauf
--  * la mise à NULL de user_id (clé étrangère ON DELETE SET NULL, effacement RGPD d'un compte) ;
--  * la purge de rétention, qui active explicitement `polyweb.audit_purge` dans sa transaction.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF coalesce(current_setting('polyweb.audit_purge', true), '') = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'audit_log est en ajout seul (DELETE interdit hors purge de rétention)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.user_id IS NULL AND OLD.user_id IS NOT NULL
     AND (to_jsonb(NEW) - 'user_id') = (to_jsonb(OLD) - 'user_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_log est en ajout seul (UPDATE interdit)' USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_append_only_trg ON "audit_log";
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only_trg BEFORE UPDATE OR DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('polyweb.audit_purge', true), '') = 'on' THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'audit_log est en ajout seul (TRUNCATE interdit)' USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_no_truncate_trg ON "audit_log";
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate_trg BEFORE TRUNCATE ON "audit_log" FOR EACH STATEMENT EXECUTE FUNCTION audit_log_no_truncate();
