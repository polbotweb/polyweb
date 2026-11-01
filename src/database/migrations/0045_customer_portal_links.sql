ALTER TABLE "sales_documents" ADD COLUMN "customer_user_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "customer_user_id" text;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_customer_user_id_user_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_user_id_user_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_documents_customer_user_idx" ON "sales_documents" USING btree ("customer_user_id");--> statement-breakpoint
CREATE INDEX "bookings_customer_user_idx" ON "bookings" USING btree ("customer_user_id");