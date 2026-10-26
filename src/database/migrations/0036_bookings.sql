CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"number" text,
	"status" text DEFAULT 'REQUESTED' NOT NULL,
	"resource_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"party_size" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"confirmed_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_interval_valid" CHECK ("bookings"."ends_at" > "bookings"."starts_at"),
	CONSTRAINT "bookings_party_size_positive" CHECK ("bookings"."party_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "bookings_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "bookings_locks_resource_id_unique" UNIQUE("resource_id")
);
--> statement-breakpoint
CREATE TABLE "bookings_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'room' NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"slot_minutes" integer DEFAULT 30 NOT NULL,
	"windows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_resources_capacity_positive" CHECK ("bookings_resources"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "bookings_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_resource_id_bookings_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."bookings_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings_locks" ADD CONSTRAINT "bookings_locks_resource_id_bookings_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings_locks" ADD CONSTRAINT "bookings_locks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings_resources" ADD CONSTRAINT "bookings_resources_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings_revisions" ADD CONSTRAINT "bookings_revisions_resource_id_bookings_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings_revisions" ADD CONSTRAINT "bookings_revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_org_slug_uidx" ON "bookings" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_org_number_uidx" ON "bookings" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "bookings_org_status_idx" ON "bookings" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "bookings_resource_starts_idx" ON "bookings" USING btree ("resource_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_resources_org_code_uidx" ON "bookings_resources" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "bookings_revisions_resource_idx" ON "bookings_revisions" USING btree ("resource_id");--> statement-breakpoint
-- Custom : FK « no action » vers la ressource vérifiée en fin de transaction (cascade de suppression d'organisation).
ALTER TABLE "bookings" ALTER CONSTRAINT "bookings_resource_id_bookings_resources_id_fk" DEFERRABLE INITIALLY DEFERRED;
