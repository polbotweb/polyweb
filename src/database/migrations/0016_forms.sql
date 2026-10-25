CREATE TABLE "form_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"form_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"locale" varchar(8),
	"ip_hash" varchar(32),
	"user_agent" varchar(300),
	"status" varchar(16) DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_submissions_form_idx" ON "form_submissions" USING btree ("form_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "forms_site_slug_uidx" ON "forms" USING btree ("site_id","slug");