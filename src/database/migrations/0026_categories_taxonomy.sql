CREATE TABLE "event_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"parent_id" text,
	"slug" text NOT NULL,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "event_categories_no_self_parent" CHECK ("event_categories"."parent_id" IS NULL OR "event_categories"."parent_id" != "event_categories"."id")
);
--> statement-breakpoint
CREATE TABLE "event_category_links" (
	"event_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "event_category_links_event_id_category_id_pk" PRIMARY KEY("event_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "event_category_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"organization_id" text,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"parent_id" text,
	"slug" text NOT NULL,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_no_self_parent" CHECK ("product_categories"."parent_id" IS NULL OR "product_categories"."parent_id" != "product_categories"."id")
);
--> statement-breakpoint
CREATE TABLE "product_category_links" (
	"product_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "product_category_links_product_id_category_id_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "product_category_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"organization_id" text,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"parent_id" text,
	"slug" text NOT NULL,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_categories_no_self_parent" CHECK ("course_categories"."parent_id" IS NULL OR "course_categories"."parent_id" != "course_categories"."id")
);
--> statement-breakpoint
CREATE TABLE "course_category_links" (
	"course_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "course_category_links_course_id_category_id_pk" PRIMARY KEY("course_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "course_category_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"organization_id" text,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formation_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"parent_id" text,
	"slug" text NOT NULL,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "formation_categories_no_self_parent" CHECK ("formation_categories"."parent_id" IS NULL OR "formation_categories"."parent_id" != "formation_categories"."id")
);
--> statement-breakpoint
CREATE TABLE "formation_category_links" (
	"formation_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "formation_category_links_formation_id_category_id_pk" PRIMARY KEY("formation_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "formation_category_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"organization_id" text,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_parent_id_event_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."event_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_category_links" ADD CONSTRAINT "event_category_links_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_category_links" ADD CONSTRAINT "event_category_links_category_id_event_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."event_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_category_translations" ADD CONSTRAINT "event_category_translations_category_id_event_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."event_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_category_translations" ADD CONSTRAINT "event_category_translations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_product_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."product_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_links" ADD CONSTRAINT "product_category_links_product_id_shop_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shop_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_links" ADD CONSTRAINT "product_category_links_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_translations" ADD CONSTRAINT "product_category_translations_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_translations" ADD CONSTRAINT "product_category_translations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_categories" ADD CONSTRAINT "course_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_categories" ADD CONSTRAINT "course_categories_parent_id_course_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."course_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_category_links" ADD CONSTRAINT "course_category_links_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_category_links" ADD CONSTRAINT "course_category_links_category_id_course_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."course_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_category_translations" ADD CONSTRAINT "course_category_translations_category_id_course_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."course_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_category_translations" ADD CONSTRAINT "course_category_translations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_categories" ADD CONSTRAINT "formation_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_categories" ADD CONSTRAINT "formation_categories_parent_id_formation_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."formation_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_category_links" ADD CONSTRAINT "formation_category_links_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_category_links" ADD CONSTRAINT "formation_category_links_category_id_formation_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."formation_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_category_translations" ADD CONSTRAINT "formation_category_translations_category_id_formation_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."formation_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_category_translations" ADD CONSTRAINT "formation_category_translations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_categories_org_slug_uidx" ON "event_categories" USING btree ("organization_id","slug") WHERE "event_categories"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_categories_global_slug_uidx" ON "event_categories" USING btree ("slug") WHERE "event_categories"."organization_id" IS NULL;--> statement-breakpoint
CREATE INDEX "event_categories_org_idx" ON "event_categories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "event_categories_parent_idx" ON "event_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "event_category_links_category_idx" ON "event_category_links" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_category_translations_category_locale_uidx" ON "event_category_translations" USING btree ("category_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "event_category_translations_org_locale_slug_uidx" ON "event_category_translations" USING btree ("organization_id","locale","slug") WHERE "event_category_translations"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_category_translations_global_locale_slug_uidx" ON "event_category_translations" USING btree ("locale","slug") WHERE "event_category_translations"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_org_slug_uidx" ON "product_categories" USING btree ("organization_id","slug") WHERE "product_categories"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_global_slug_uidx" ON "product_categories" USING btree ("slug") WHERE "product_categories"."organization_id" IS NULL;--> statement-breakpoint
CREATE INDEX "product_categories_org_idx" ON "product_categories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "product_categories_parent_idx" ON "product_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "product_category_links_category_idx" ON "product_category_links" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_category_translations_category_locale_uidx" ON "product_category_translations" USING btree ("category_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "product_category_translations_org_locale_slug_uidx" ON "product_category_translations" USING btree ("organization_id","locale","slug") WHERE "product_category_translations"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_category_translations_global_locale_slug_uidx" ON "product_category_translations" USING btree ("locale","slug") WHERE "product_category_translations"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "course_categories_org_slug_uidx" ON "course_categories" USING btree ("organization_id","slug") WHERE "course_categories"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "course_categories_global_slug_uidx" ON "course_categories" USING btree ("slug") WHERE "course_categories"."organization_id" IS NULL;--> statement-breakpoint
CREATE INDEX "course_categories_org_idx" ON "course_categories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "course_categories_parent_idx" ON "course_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "course_category_links_category_idx" ON "course_category_links" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_category_translations_category_locale_uidx" ON "course_category_translations" USING btree ("category_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "course_category_translations_org_locale_slug_uidx" ON "course_category_translations" USING btree ("organization_id","locale","slug") WHERE "course_category_translations"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "course_category_translations_global_locale_slug_uidx" ON "course_category_translations" USING btree ("locale","slug") WHERE "course_category_translations"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "formation_categories_org_slug_uidx" ON "formation_categories" USING btree ("organization_id","slug") WHERE "formation_categories"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "formation_categories_global_slug_uidx" ON "formation_categories" USING btree ("slug") WHERE "formation_categories"."organization_id" IS NULL;--> statement-breakpoint
CREATE INDEX "formation_categories_org_idx" ON "formation_categories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "formation_categories_parent_idx" ON "formation_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "formation_category_links_category_idx" ON "formation_category_links" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "formation_category_translations_category_locale_uidx" ON "formation_category_translations" USING btree ("category_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "formation_category_translations_org_locale_slug_uidx" ON "formation_category_translations" USING btree ("organization_id","locale","slug") WHERE "formation_category_translations"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "formation_category_translations_global_locale_slug_uidx" ON "formation_category_translations" USING btree ("locale","slug") WHERE "formation_category_translations"."organization_id" IS NULL;