CREATE TABLE "order_return_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"return_id" text NOT NULL,
	"order_line_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"accepted_quantity" integer,
	"restocked_quantity" integer,
	"condition" text,
	CONSTRAINT "order_return_lines_quantities" CHECK ("order_return_lines"."quantity" > 0
    and ("order_return_lines"."accepted_quantity" is null or ("order_return_lines"."accepted_quantity" >= 0 and "order_return_lines"."accepted_quantity" <= "order_return_lines"."quantity"))
    and ("order_return_lines"."restocked_quantity" is null or ("order_return_lines"."restocked_quantity" >= 0 and "order_return_lines"."restocked_quantity" <= coalesce("order_return_lines"."accepted_quantity", 0))))
);
--> statement-breakpoint
CREATE TABLE "order_returns" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"order_id" text NOT NULL,
	"number" text NOT NULL,
	"status" text DEFAULT 'REQUESTED' NOT NULL,
	"reason" text NOT NULL,
	"customer_note" varchar(1000),
	"admin_note" varchar(1000),
	"currency" varchar(3) NOT NULL,
	"refund_minor" integer,
	"refund_id" text,
	"refund_attempts" integer DEFAULT 0 NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"received_by" text,
	"received_at" timestamp,
	"inspected_by" text,
	"inspected_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_returns_refund_non_negative" CHECK ("order_returns"."refund_minor" is null or "order_returns"."refund_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_return_lines" ADD CONSTRAINT "order_return_lines_return_id_order_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."order_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return_lines" ADD CONSTRAINT "order_return_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_inspected_by_user_id_fk" FOREIGN KEY ("inspected_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_return_lines_return_line_uidx" ON "order_return_lines" USING btree ("return_id","order_line_id");--> statement-breakpoint
CREATE INDEX "order_return_lines_order_line_idx" ON "order_return_lines" USING btree ("order_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_returns_org_number_uidx" ON "order_returns" USING btree (coalesce("organization_id", ''),"number");--> statement-breakpoint
CREATE INDEX "order_returns_order_idx" ON "order_returns" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_returns_org_status_created_idx" ON "order_returns" USING btree ("organization_id","status","created_at");