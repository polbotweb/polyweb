CREATE TABLE "document_sequences" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"key" text NOT NULL,
	"period" text DEFAULT '' NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_sequences_scope_uq" UNIQUE NULLS NOT DISTINCT("organization_id","key","period")
);
--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;