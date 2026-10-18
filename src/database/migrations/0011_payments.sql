CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"reference" varchar(200) NOT NULL,
	"description" text,
	"provider" varchar(32) NOT NULL,
	"provider_session_id" varchar(160),
	"provider_payment_id" varchar(160),
	"status" text DEFAULT 'created' NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"customer_email" text,
	"idempotency_key" varchar(160) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	"failed_at" timestamp,
	CONSTRAINT "payments_amount_ck" CHECK ("payments"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_uidx" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payments_reference_idx" ON "payments" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_provider_payment_idx" ON "payments" USING btree ("provider_payment_id");--> statement-breakpoint
CREATE INDEX "payments_provider_session_idx" ON "payments" USING btree ("provider_session_id");