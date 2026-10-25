CREATE TABLE "page_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "page_locks_page_id_unique" UNIQUE("page_id"),
	CONSTRAINT "page_locks_expiry_after_lock" CHECK ("page_locks"."expires_at" > "page_locks"."locked_at")
);
--> statement-breakpoint
ALTER TABLE "page_locks" ADD CONSTRAINT "page_locks_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_locks" ADD CONSTRAINT "page_locks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_locks_user_idx" ON "page_locks" USING btree ("user_id");