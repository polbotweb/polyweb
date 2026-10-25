CREATE TABLE "admin_saved_views" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"resource" text NOT NULL,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_saved_views_owner_name_uq" UNIQUE NULLS NOT DISTINCT("user_id","resource","organization_id","name")
);
--> statement-breakpoint
ALTER TABLE "admin_saved_views" ADD CONSTRAINT "admin_saved_views_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_saved_views" ADD CONSTRAINT "admin_saved_views_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_saved_views_owner_idx" ON "admin_saved_views" USING btree ("user_id","resource");