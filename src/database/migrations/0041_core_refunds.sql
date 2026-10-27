CREATE TABLE "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"payment_id" text NOT NULL,
	"reference" varchar(200) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_refund_id" varchar(160),
	"status" text DEFAULT 'pending' NOT NULL,
	"amount" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"reason" text DEFAULT 'requested_by_customer' NOT NULL,
	"note" varchar(500),
	"idempotency_key" varchar(160) NOT NULL,
	"requested_by" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_reason" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"succeeded_at" timestamp,
	"failed_at" timestamp,
	CONSTRAINT "refunds_amount_ck" CHECK ("refunds"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_idempotency_uidx" ON "refunds" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_refund_uidx" ON "refunds" USING btree ("provider","provider_refund_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refunds_reference_idx" ON "refunds" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "refunds_org_status_idx" ON "refunds" USING btree ("organization_id","status","created_at");