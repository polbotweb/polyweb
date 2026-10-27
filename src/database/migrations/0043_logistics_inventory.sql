CREATE TABLE "logistics_inventory_count_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"count_id" text NOT NULL,
	"item_id" text NOT NULL,
	"sku" text NOT NULL,
	"expected" integer NOT NULL,
	"counted" integer,
	"system" integer,
	"variance" integer,
	"counted_by" text,
	"counted_at" timestamp,
	CONSTRAINT "logistics_inventory_count_lines_counted_non_negative" CHECK ("logistics_inventory_count_lines"."counted" IS NULL OR "logistics_inventory_count_lines"."counted" >= 0)
);
--> statement-breakpoint
CREATE TABLE "logistics_inventory_counts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"warehouse_id" text NOT NULL,
	"number" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"note" text,
	"created_by" text,
	"validated_by" text,
	"validated_at" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "logistics_stock_movements" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "logistics_stock_movements" ADD COLUMN "inventory_count_id" text;--> statement-breakpoint
ALTER TABLE "logistics_inventory_count_lines" ADD CONSTRAINT "logistics_inventory_count_lines_count_id_logistics_inventory_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."logistics_inventory_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_inventory_count_lines" ADD CONSTRAINT "logistics_inventory_count_lines_item_id_logistics_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."logistics_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_inventory_count_lines" ADD CONSTRAINT "logistics_inventory_count_lines_counted_by_user_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_inventory_counts" ADD CONSTRAINT "logistics_inventory_counts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_inventory_counts" ADD CONSTRAINT "logistics_inventory_counts_warehouse_id_logistics_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."logistics_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_inventory_counts" ADD CONSTRAINT "logistics_inventory_counts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_inventory_counts" ADD CONSTRAINT "logistics_inventory_counts_validated_by_user_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "logistics_inventory_count_lines_item_uidx" ON "logistics_inventory_count_lines" USING btree ("count_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "logistics_inventory_counts_org_number_uidx" ON "logistics_inventory_counts" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "logistics_inventory_counts_open_uidx" ON "logistics_inventory_counts" USING btree ("warehouse_id") WHERE "logistics_inventory_counts"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "logistics_inventory_counts_org_idx" ON "logistics_inventory_counts" USING btree ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "logistics_stock_movements" ADD CONSTRAINT "logistics_stock_movements_inventory_count_id_logistics_inventory_counts_id_fk" FOREIGN KEY ("inventory_count_id") REFERENCES "public"."logistics_inventory_counts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "logistics_stock_movements_ledger_idx" ON "logistics_stock_movements" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "logistics_stock_movements_inventory_idx" ON "logistics_stock_movements" USING btree ("inventory_count_id");--> statement-breakpoint
-- Reprise de l'origine des mouvements existants (déterministe, d'après les écritures connues) :
-- expédition (shipment_id), transfert (kinds transfer_*), réception d'achat (référencée par
-- purchasing_receipt_lines.movement_id), retour client (kind return hors expédition), vente boutique
-- (sortie sans auteur, produite par consumeReservations) ; le reste est une saisie manuelle.
UPDATE "logistics_stock_movements" AS m SET "source" = CASE
	WHEN m."shipment_id" IS NOT NULL THEN 'shipment'
	WHEN m."kind" IN ('transfer_in', 'transfer_out') THEN 'transfer'
	WHEN EXISTS (SELECT 1 FROM "purchasing_receipt_lines" r WHERE r."movement_id" = m."id") THEN 'purchase'
	WHEN m."kind" = 'return' THEN 'return'
	WHEN m."kind" = 'issue' AND m."created_by" IS NULL THEN 'order'
	ELSE 'manual'
END;
