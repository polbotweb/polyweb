CREATE TABLE "search_documents" (
	"id" varchar(200) PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"kind" varchar(32) NOT NULL,
	"type" varchar(64),
	"entity_id" text NOT NULL,
	"locale" varchar(8) NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"body" text DEFAULT '' NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp with time zone,
	"tsv" "tsvector",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_documents_tsv_gin_idx" ON "search_documents" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "search_documents_site_locale_idx" ON "search_documents" USING btree ("site_id","locale");--> statement-breakpoint
CREATE INDEX "search_documents_entity_idx" ON "search_documents" USING btree ("kind","entity_id");