CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" varchar(32) NOT NULL,
	"event_id" varchar(160) NOT NULL,
	"type" varchar(80) NOT NULL,
	"payment_id" text,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"default_currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"stripe_account_id" varchar(64),
	"statement_descriptor" varchar(22),
	"checkout_expiry_minutes" integer DEFAULT 60 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_settings_org_uq" UNIQUE NULLS NOT DISTINCT("organization_id"),
	CONSTRAINT "payment_settings_expiry_ck" CHECK ("payment_settings"."checkout_expiry_minutes" between 30 and 1440)
);
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "amount" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "deposit_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "deposit_currency" varchar(3) DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "deposit_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings_resources" ADD COLUMN "deposit_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings_resources" ADD COLUMN "deposit_currency" varchar(3) DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_uidx" ON "payment_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "payment_events_payment_idx" ON "payment_events" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payments_expiry_idx" ON "payments" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "bookings_payment_due_idx" ON "bookings" USING btree ("status","payment_due_at");--> statement-breakpoint
ALTER TABLE "bookings_resources" ADD CONSTRAINT "bookings_resources_deposit_non_negative" CHECK ("bookings_resources"."deposit_minor" >= 0);