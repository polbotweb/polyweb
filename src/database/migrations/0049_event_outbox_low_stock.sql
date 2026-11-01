CREATE TABLE "event_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"organization_id" text,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"locked_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "logistics_items" ADD COLUMN "low_stock_threshold" integer;--> statement-breakpoint
CREATE INDEX "event_outbox_pending_idx" ON "event_outbox" USING btree ("dispatched_at","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_hook_event_uidx" ON "webhook_deliveries" USING btree ("webhook_id","event_id");--> statement-breakpoint
ALTER TABLE "logistics_items" ADD CONSTRAINT "logistics_items_low_stock_ck" CHECK ("logistics_items"."low_stock_threshold" is null or "logistics_items"."low_stock_threshold" >= 0);