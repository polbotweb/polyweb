CREATE TABLE "sales_seller_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"legal_name" text NOT NULL,
	"vat_number" text,
	"legal_id" text,
	"legal_id_scheme" text,
	"address_line1" text,
	"address_line2" text,
	"postcode" text,
	"city" text,
	"country" text NOT NULL,
	"email" text,
	"iban" text,
	"bic" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_seller_profiles" ADD CONSTRAINT "sales_seller_profiles_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_seller_profiles" ADD CONSTRAINT "sales_seller_profiles_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_seller_profiles_org_uidx" ON "sales_seller_profiles" USING btree (coalesce("organization_id", ''));