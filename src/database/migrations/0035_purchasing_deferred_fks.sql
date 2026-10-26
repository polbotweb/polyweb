-- Custom : FK « no action » inter-tables du module purchasing vérifiées en fin de transaction,
-- pour que la suppression en cascade d'une organisation (ordre des triggers RI) aboutisse.
ALTER TABLE "purchasing_orders" ALTER CONSTRAINT "purchasing_orders_supplier_id_purchasing_suppliers_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "purchasing_orders" ALTER CONSTRAINT "purchasing_orders_warehouse_id_logistics_warehouses_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "purchasing_order_lines" ALTER CONSTRAINT "purchasing_order_lines_item_id_logistics_items_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "purchasing_receipt_lines" ALTER CONSTRAINT "purchasing_receipt_lines_order_line_id_purchasing_order_lines_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "purchasing_receipt_lines" ALTER CONSTRAINT "purchasing_receipt_lines_item_id_logistics_items_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "purchasing_receipt_lines" ALTER CONSTRAINT "purchasing_receipt_lines_movement_id_logistics_stock_movements_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "purchasing_receipts" ALTER CONSTRAINT "purchasing_receipts_order_id_purchasing_orders_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "purchasing_receipts" ALTER CONSTRAINT "purchasing_receipts_warehouse_id_logistics_warehouses_id_fk" DEFERRABLE INITIALLY DEFERRED;
