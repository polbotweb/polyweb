CREATE TABLE "logistics_stock_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"warehouse_id" text NOT NULL,
	"item_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"reference" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "logistics_stock_reservations_quantity_positive" CHECK ("logistics_stock_reservations"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "cart_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"cart_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cart_lines_quantity_range" CHECK ("cart_lines"."quantity" between 1 and 99)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"user_id" text,
	"currency" varchar(3),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"position" integer NOT NULL,
	"variant_id" text,
	"sku" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"line_total_minor" integer NOT NULL,
	"tax_category" text NOT NULL,
	CONSTRAINT "order_lines_quantity_positive" CHECK ("order_lines"."quantity" > 0),
	CONSTRAINT "order_lines_total_consistent" CHECK ("order_lines"."line_total_minor" = "order_lines"."unit_price_minor" * "order_lines"."quantity")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"number" text NOT NULL,
	"status" text DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"locale" text NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"customer_name" text NOT NULL,
	"phone" text,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"postcode" text NOT NULL,
	"city" text NOT NULL,
	"country" varchar(2) NOT NULL,
	"shipping_method" text NOT NULL,
	"shipping_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"net_minor" integer NOT NULL,
	"tax_minor" integer NOT NULL,
	"gross_minor" integer NOT NULL,
	"tax_treatment" text NOT NULL,
	"tax_country" varchar(2),
	"tax_breakdown" jsonb NOT NULL,
	"payment_id" text,
	"stock_shortage" text,
	"sales_document_id" text,
	"shipment_id" text,
	"expires_at" timestamp NOT NULL,
	"paid_at" timestamp,
	"shipped_at" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_amounts_consistent" CHECK ("orders"."net_minor" >= 0 and "orders"."tax_minor" >= 0 and "orders"."shipping_minor" >= 0 and "orders"."gross_minor" = "orders"."net_minor" + "orders"."tax_minor")
);
--> statement-breakpoint
ALTER TABLE "logistics_stock_reservations" ADD CONSTRAINT "logistics_stock_reservations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_stock_reservations" ADD CONSTRAINT "logistics_stock_reservations_warehouse_id_logistics_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."logistics_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_stock_reservations" ADD CONSTRAINT "logistics_stock_reservations_item_id_logistics_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."logistics_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_sales_document_id_sales_documents_id_fk" FOREIGN KEY ("sales_document_id") REFERENCES "public"."sales_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipment_id_logistics_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."logistics_shipments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "logistics_stock_reservations_active_idx" ON "logistics_stock_reservations" USING btree ("warehouse_id","item_id") WHERE "logistics_stock_reservations"."status" = 'active';--> statement-breakpoint
CREATE INDEX "logistics_stock_reservations_reference_idx" ON "logistics_stock_reservations" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "logistics_stock_reservations_expiry_idx" ON "logistics_stock_reservations" USING btree ("expires_at") WHERE "logistics_stock_reservations"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "cart_lines_cart_variant_uidx" ON "cart_lines" USING btree ("cart_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_org_user_uidx" ON "carts" USING btree (coalesce("organization_id", ''),"user_id") WHERE "carts"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "carts_updated_idx" ON "carts" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_order_position_uidx" ON "order_lines" USING btree ("order_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_org_number_uidx" ON "orders" USING btree (coalesce("organization_id", ''),"number");--> statement-breakpoint
CREATE INDEX "orders_org_status_created_idx" ON "orders" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_email_idx" ON "orders" USING btree ("email");