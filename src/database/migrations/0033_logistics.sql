CREATE TABLE "logistics_shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"number" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"warehouse_id" text NOT NULL,
	"sales_document_id" text,
	"recipient_name" text NOT NULL,
	"address" text,
	"country" text NOT NULL,
	"carrier" text,
	"tracking_number" text,
	"weight_grams" integer,
	"shipped_at" timestamp,
	"delivered_at" timestamp,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "logistics_shipments_weight_non_negative" CHECK ("logistics_shipments"."weight_grams" IS NULL OR "logistics_shipments"."weight_grams" >= 0)
);
--> statement-breakpoint
CREATE TABLE "logistics_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"variant_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logistics_shipment_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"shipment_id" text NOT NULL,
	"position" integer NOT NULL,
	"item_id" text NOT NULL,
	"sku" text NOT NULL,
	"description" text,
	"quantity" integer NOT NULL,
	CONSTRAINT "logistics_shipment_lines_quantity_positive" CHECK ("logistics_shipment_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "logistics_shipment_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "logistics_shipment_locks_resource_id_unique" UNIQUE("resource_id")
);
--> statement-breakpoint
CREATE TABLE "logistics_shipment_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logistics_stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"warehouse_id" text NOT NULL,
	"item_id" text NOT NULL,
	"kind" text NOT NULL,
	"delta" integer NOT NULL,
	"shipment_id" text,
	"reference" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "logistics_stock_movements_delta_non_zero" CHECK ("logistics_stock_movements"."delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "logistics_warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"address" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "logistics_shipments" ADD CONSTRAINT "logistics_shipments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_shipments" ADD CONSTRAINT "logistics_shipments_warehouse_id_logistics_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."logistics_warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_shipments" ADD CONSTRAINT "logistics_shipments_sales_document_id_sales_documents_id_fk" FOREIGN KEY ("sales_document_id") REFERENCES "public"."sales_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_shipments" ADD CONSTRAINT "logistics_shipments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_items" ADD CONSTRAINT "logistics_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_items" ADD CONSTRAINT "logistics_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_shipment_lines" ADD CONSTRAINT "logistics_shipment_lines_shipment_id_logistics_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."logistics_shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_shipment_lines" ADD CONSTRAINT "logistics_shipment_lines_item_id_logistics_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."logistics_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_shipment_locks" ADD CONSTRAINT "logistics_shipment_locks_resource_id_logistics_shipments_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."logistics_shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_shipment_locks" ADD CONSTRAINT "logistics_shipment_locks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_shipment_revisions" ADD CONSTRAINT "logistics_shipment_revisions_resource_id_logistics_shipments_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."logistics_shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_shipment_revisions" ADD CONSTRAINT "logistics_shipment_revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_stock_movements" ADD CONSTRAINT "logistics_stock_movements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_stock_movements" ADD CONSTRAINT "logistics_stock_movements_warehouse_id_logistics_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."logistics_warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_stock_movements" ADD CONSTRAINT "logistics_stock_movements_item_id_logistics_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."logistics_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_stock_movements" ADD CONSTRAINT "logistics_stock_movements_shipment_id_logistics_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."logistics_shipments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_stock_movements" ADD CONSTRAINT "logistics_stock_movements_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_warehouses" ADD CONSTRAINT "logistics_warehouses_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "logistics_shipments_org_slug_uidx" ON "logistics_shipments" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "logistics_shipments_org_number_uidx" ON "logistics_shipments" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "logistics_shipments_org_status_idx" ON "logistics_shipments" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "logistics_shipments_sales_idx" ON "logistics_shipments" USING btree ("sales_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "logistics_items_org_sku_uidx" ON "logistics_items" USING btree ("organization_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "logistics_shipment_lines_position_uidx" ON "logistics_shipment_lines" USING btree ("shipment_id","position");--> statement-breakpoint
CREATE INDEX "logistics_shipment_revisions_resource_idx" ON "logistics_shipment_revisions" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "logistics_stock_movements_level_idx" ON "logistics_stock_movements" USING btree ("warehouse_id","item_id");--> statement-breakpoint
CREATE INDEX "logistics_stock_movements_shipment_idx" ON "logistics_stock_movements" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "logistics_warehouses_org_code_uidx" ON "logistics_warehouses" USING btree ("organization_id","code");