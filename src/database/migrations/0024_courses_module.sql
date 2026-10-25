CREATE TABLE "course_lesson_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"summary" text
);
--> statement-breakpoint
CREATE TABLE "course_lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"position" integer NOT NULL,
	"duration_minutes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_lessons_position_non_negative" CHECK ("course_lessons"."position" >= 0),
	CONSTRAINT "course_lessons_duration_positive" CHECK ("course_lessons"."duration_minutes" IS NULL OR "course_lessons"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "course_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"organization_id" text,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"excerpt" text,
	"content" text DEFAULT '' NOT NULL,
	"prerequisites" text,
	"meta_title" text,
	"meta_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"level" text,
	"duration_minutes" integer,
	"price_minor" integer,
	"currency" varchar(3),
	"cover_image_id" text,
	"published_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "courses_duration_positive" CHECK ("courses"."duration_minutes" IS NULL OR "courses"."duration_minutes" > 0),
	CONSTRAINT "courses_price_non_negative" CHECK ("courses"."price_minor" IS NULL OR "courses"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "courses_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "courses_locks_resource_id_unique" UNIQUE("resource_id")
);
--> statement-breakpoint
CREATE TABLE "courses_revisions" (
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
CREATE TABLE "formation_courses" (
	"formation_id" text NOT NULL,
	"course_id" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_lesson_translations" ADD CONSTRAINT "course_lesson_translations_lesson_id_course_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."course_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_translations" ADD CONSTRAINT "course_translations_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_translations" ADD CONSTRAINT "course_translations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_cover_image_id_media_files_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses_locks" ADD CONSTRAINT "courses_locks_resource_id_courses_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses_locks" ADD CONSTRAINT "courses_locks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses_revisions" ADD CONSTRAINT "courses_revisions_resource_id_courses_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses_revisions" ADD CONSTRAINT "courses_revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_courses" ADD CONSTRAINT "formation_courses_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_courses" ADD CONSTRAINT "formation_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_lesson_translations_lesson_locale_uidx" ON "course_lesson_translations" USING btree ("lesson_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "course_lessons_course_position_uidx" ON "course_lessons" USING btree ("course_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "course_translations_course_locale_uidx" ON "course_translations" USING btree ("course_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "course_translations_org_locale_slug_uidx" ON "course_translations" USING btree ("organization_id","locale","slug") WHERE "course_translations"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "course_translations_global_locale_slug_uidx" ON "course_translations" USING btree ("locale","slug") WHERE "course_translations"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "courses_org_slug_uidx" ON "courses" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "courses_org_idx" ON "courses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "courses_status_idx" ON "courses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "courses_revisions_resource_idx" ON "courses_revisions" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "formation_courses_pair_uidx" ON "formation_courses" USING btree ("formation_id","course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "formation_courses_position_uidx" ON "formation_courses" USING btree ("formation_id","position");--> statement-breakpoint
CREATE INDEX "formation_courses_course_idx" ON "formation_courses" USING btree ("course_id");