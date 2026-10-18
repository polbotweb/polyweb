CREATE TABLE "blog_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"email" text NOT NULL,
	"locale" text NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"confirmed_at" timestamp,
	"unsubscribed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blog_subscribers_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "twitter" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "linkedin" text;--> statement-breakpoint
ALTER TABLE "blog_subscribers" ADD CONSTRAINT "blog_subscribers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blog_subscribers_org_email_uidx" ON "blog_subscribers" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "blog_subscribers_org_idx" ON "blog_subscribers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "blog_subscribers_status_idx" ON "blog_subscribers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blog_subscribers_token_idx" ON "blog_subscribers" USING btree ("token");