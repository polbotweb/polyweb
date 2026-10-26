CREATE TABLE "purchasing_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"number" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"supplier_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"expected_date" date,
	"net_minor" bigint DEFAULT 0 NOT NULL,
	"sent_at" timestamp,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"position" integer NOT NULL,
	"item_id" text NOT NULL,
	"sku" text NOT NULL,
	"description" text,
	"quantity" integer NOT NULL,
	"received_quantity" integer DEFAULT 0 NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"net_minor" bigint NOT NULL,
	CONSTRAINT "purchasing_order_lines_quantity_positive" CHECK ("purchasing_order_lines"."quantity" > 0),
	CONSTRAINT "purchasing_order_lines_received_range" CHECK ("purchasing_order_lines"."received_quantity" >= 0 AND "purchasing_order_lines"."received_quantity" <= "purchasing_order_lines"."quantity"),
	CONSTRAINT "purchasing_order_lines_price_non_negative" CHECK ("purchasing_order_lines"."unit_price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchasing_order_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "purchasing_order_locks_resource_id_unique" UNIQUE("resource_id")
);
--> statement-breakpoint
CREATE TABLE "purchasing_order_revisions" (
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
CREATE TABLE "purchasing_receipt_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"receipt_id" text NOT NULL,
	"order_line_id" text NOT NULL,
	"item_id" text NOT NULL,
	"sku" text NOT NULL,
	"quantity" integer NOT NULL,
	"movement_id" text NOT NULL,
	CONSTRAINT "purchasing_receipt_lines_quantity_positive" CHECK ("purchasing_receipt_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchasing_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"order_id" text NOT NULL,
	"number" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"supplier_reference" text,
	"notes" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "purchasing_suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"country" text,
	"vat_number" text,
	"address" text,
	"payment_term_days" integer DEFAULT 30 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchasing_orders" ADD CONSTRAINT "purchasing_orders_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_orders" ADD CONSTRAINT "purchasing_orders_supplier_id_purchasing_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."purchasing_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_orders" ADD CONSTRAINT "purchasing_orders_warehouse_id_logistics_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."logistics_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_orders" ADD CONSTRAINT "purchasing_orders_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" ADD CONSTRAINT "purchasing_order_lines_order_id_purchasing_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchasing_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" ADD CONSTRAINT "purchasing_order_lines_item_id_logistics_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."logistics_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_order_locks" ADD CONSTRAINT "purchasing_order_locks_resource_id_purchasing_orders_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."purchasing_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_order_locks" ADD CONSTRAINT "purchasing_order_locks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_order_revisions" ADD CONSTRAINT "purchasing_order_revisions_resource_id_purchasing_orders_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."purchasing_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_order_revisions" ADD CONSTRAINT "purchasing_order_revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_receipt_lines" ADD CONSTRAINT "purchasing_receipt_lines_receipt_id_purchasing_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."purchasing_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_receipt_lines" ADD CONSTRAINT "purchasing_receipt_lines_order_line_id_purchasing_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."purchasing_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_receipt_lines" ADD CONSTRAINT "purchasing_receipt_lines_item_id_logistics_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."logistics_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_receipt_lines" ADD CONSTRAINT "purchasing_receipt_lines_movement_id_logistics_stock_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."logistics_stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_receipts" ADD CONSTRAINT "purchasing_receipts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_receipts" ADD CONSTRAINT "purchasing_receipts_order_id_purchasing_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchasing_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_receipts" ADD CONSTRAINT "purchasing_receipts_warehouse_id_logistics_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."logistics_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_receipts" ADD CONSTRAINT "purchasing_receipts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_suppliers" ADD CONSTRAINT "purchasing_suppliers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_orders_org_slug_uidx" ON "purchasing_orders" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_orders_org_number_uidx" ON "purchasing_orders" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "purchasing_orders_org_status_idx" ON "purchasing_orders" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "purchasing_orders_supplier_idx" ON "purchasing_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_order_lines_position_uidx" ON "purchasing_order_lines" USING btree ("order_id","position");--> statement-breakpoint
CREATE INDEX "purchasing_order_revisions_resource_idx" ON "purchasing_order_revisions" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "purchasing_receipt_lines_receipt_idx" ON "purchasing_receipt_lines" USING btree ("receipt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_receipts_org_number_uidx" ON "purchasing_receipts" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "purchasing_receipts_order_idx" ON "purchasing_receipts" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchasing_suppliers_org_code_uidx" ON "purchasing_suppliers" USING btree ("organization_id","code");