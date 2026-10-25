/**
 * Tables du domaine courses : contenu, révisions et verrous d'édition.
 *
 * Exporté depuis `src/database/schemas.ts` puis `pnpm db:generate`
 * pour produire la migration (le générateur n'écrit aucune migration).
 */
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { organization, user } from "@database/schemas/auth.schema";
import { mediaFiles } from "@database/schemas/media.schema";
import { LOCALES } from "@i18n/config";
import { formations } from "../../formations/schema";
import { COURSES_STATUSES } from "../domain/workflow";

/** Niveaux déclarés (union fermée, pas de texte libre). */
export const COURSE_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];

/**
 * Cours = unité d'apprentissage (catalogue éditorial + plan de leçons),
 * contexte borné DISTINCT des Formations (TODO §19.2). Inscription,
 * progression, certificats et paiement restent HORS du CMS Core.
 */
export const courses = pgTable("courses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: COURSES_STATUSES }).default("DRAFT").notNull(),
  level: text("level", { enum: COURSE_LEVELS }),
  durationMinutes: integer("duration_minutes"),
  priceMinor: integer("price_minor"),
  currency: varchar("currency", { length: 3 }),
  coverImageId: text("cover_image_id").references(() => mediaFiles.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("courses_org_slug_uidx").on(table.organizationId, table.slug),
  index("courses_org_idx").on(table.organizationId),
  index("courses_status_idx").on(table.status),
  check("courses_duration_positive", sql`${table.durationMinutes} IS NULL OR ${table.durationMinutes} > 0`),
  check("courses_price_non_negative", sql`${table.priceMinor} IS NULL OR ${table.priceMinor} >= 0`),
]);

/** Localisation relationnelle (pas de JSONB) : une ligne par locale. */
export const courseTranslations = pgTable("course_translations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: LOCALES }).notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  excerpt: text("excerpt"),
  content: text("content").notNull().default(""),
  prerequisites: text("prerequisites"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("course_translations_course_locale_uidx").on(table.courseId, table.locale),
  uniqueIndex("course_translations_org_locale_slug_uidx").on(table.organizationId, table.locale, table.slug).where(sql`${table.organizationId} IS NOT NULL`),
  uniqueIndex("course_translations_global_locale_slug_uidx").on(table.locale, table.slug).where(sql`${table.organizationId} IS NULL`),
]);

/** Plan du cours : leçons ordonnées (structure éditoriale, aucune progression ici). */
export const courseLessons = pgTable("course_lessons", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  durationMinutes: integer("duration_minutes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("course_lessons_course_position_uidx").on(table.courseId, table.position),
  check("course_lessons_position_non_negative", sql`${table.position} >= 0`),
  check("course_lessons_duration_positive", sql`${table.durationMinutes} IS NULL OR ${table.durationMinutes} > 0`),
]);

/** Libellés localisés d'une leçon (relationnel). */
export const courseLessonTranslations = pgTable("course_lesson_translations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lessonId: text("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: LOCALES }).notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
}, (table) => [uniqueIndex("course_lesson_translations_lesson_locale_uidx").on(table.lessonId, table.locale)]);

/**
 * Liaison Formation → Cours (TODO §19.1/§19.2) : table dédiée, typée par clés
 * étrangères (pas de polymorphisme). Un cours peut appartenir à plusieurs parcours.
 */
export const formationCourses = pgTable("formation_courses", {
  formationId: text("formation_id").notNull().references(() => formations.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
}, (table) => [
  uniqueIndex("formation_courses_pair_uidx").on(table.formationId, table.courseId),
  uniqueIndex("formation_courses_position_uidx").on(table.formationId, table.position),
  index("formation_courses_course_idx").on(table.courseId),
]);

/** Révisions (core/revision) : une ligne par écriture, pour l'historique et la restauration. */
export const coursesRevisions = pgTable("courses_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: COURSES_STATUSES }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("courses_revisions_resource_idx").on(table.resourceId)]);

/** Verrous d'édition (core/locks) : une ligne par ressource, propriétaire utilisateur + session. */
export const coursesLocks = pgTable("courses_locks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().unique().references(() => courses.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});
