/**
 * Lecture du domaine courses.
 *
 * SEUL endroit autorisé à LIRE la base pour ce domaine (les écritures passent par
 * `services/`). Chaque lecture est un Effect (`dbTry` → DbError typé) ;
 * `loadCourses` en est l'adaptateur Promise pour les pages Astro. Les composants
 * reçoivent des DTO, jamais des lignes brutes.
 */
import { Effect } from "effect";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import type { Locale } from "@i18n/config";
import { courseLessons, courseLessonTranslations, courses, courseTranslations, formationCourses, type CourseLevel } from "../schema";

/** DTO public du domaine. */
export interface CoursesDTO {
  id: string;
  slug: string;
  title: string;
  status: string;
}

/** DTO public localisé (page détail / cartes). */
export interface CoursePublicDTO {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  prerequisites: string | null;
  level: CourseLevel | null;
  durationMinutes: number | null;
  priceMinor: number | null;
  currency: string | null;
  coverImageId: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

/** Leçon localisée du plan de cours. */
export interface CourseLessonDTO {
  id: string;
  position: number;
  durationMinutes: number | null;
  title: string;
  summary: string | null;
}

const publicColumns = {
  id: courses.id,
  slug: courseTranslations.slug,
  title: courseTranslations.title,
  excerpt: courseTranslations.excerpt,
  content: courseTranslations.content,
  prerequisites: courseTranslations.prerequisites,
  level: courses.level,
  durationMinutes: courses.durationMinutes,
  priceMinor: courses.priceMinor,
  currency: courses.currency,
  coverImageId: courses.coverImageId,
  metaTitle: courseTranslations.metaTitle,
  metaDescription: courseTranslations.metaDescription,
};

/**
 * Portée tenant EXPLICITE : `organizationId` null = contenu global, jamais de
 * repli silencieux d'une organisation vers le global (TODO §21).
 */
const tenantScope = (organizationId: string | null) =>
  organizationId ? eq(courses.organizationId, organizationId) : isNull(courses.organizationId);

export const coursesLoader = {
  /** Élément publié par slug localisé (relationnel, sans repli de locale). */
  publishedBySlug: (locale: Locale, slug: string, organizationId: string | null) =>
    dbTry("courses.publishedBySlug", () =>
      getDrizzle()
        .select(publicColumns)
        .from(courseTranslations)
        .innerJoin(courses, eq(courses.id, courseTranslations.courseId))
        .where(and(
          eq(courseTranslations.locale, locale),
          eq(courseTranslations.slug, slug),
          eq(courses.status, "PUBLISHED"),
          tenantScope(organizationId),
        ))
        .limit(1),
    ).pipe(Effect.map((rows): CoursePublicDTO | null => rows[0] ?? null)),
  /** Éléments publiés d'une locale. */
  listPublished: (locale: Locale, organizationId: string | null, limit = 50) =>
    dbTry("courses.listPublished", () =>
      getDrizzle()
        .select(publicColumns)
        .from(courseTranslations)
        .innerJoin(courses, eq(courses.id, courseTranslations.courseId))
        .where(and(
          eq(courseTranslations.locale, locale),
          eq(courses.status, "PUBLISHED"),
          tenantScope(organizationId),
        ))
        .orderBy(asc(courses.title))
        .limit(limit),
    ).pipe(Effect.map((rows): CoursePublicDTO[] => rows)),
  /** Plan localisé d'un cours (leçons ordonnées ; une leçon non traduite est omise, sans repli). */
  lessons: (courseId: string, locale: Locale) =>
    dbTry("courses.lessons", () =>
      getDrizzle()
        .select({ id: courseLessons.id, position: courseLessons.position, durationMinutes: courseLessons.durationMinutes, title: courseLessonTranslations.title, summary: courseLessonTranslations.summary })
        .from(courseLessons)
        .innerJoin(courseLessonTranslations, and(eq(courseLessonTranslations.lessonId, courseLessons.id), eq(courseLessonTranslations.locale, locale)))
        .where(eq(courseLessons.courseId, courseId))
        .orderBy(asc(courseLessons.position)),
    ).pipe(Effect.map((rows): CourseLessonDTO[] => rows)),
  /** Cours publiés d'un parcours (Formation), dans l'ordre du parcours. */
  publishedByFormation: (formationId: string, locale: Locale, organizationId: string | null) =>
    dbTry("courses.publishedByFormation", () =>
      getDrizzle()
        .select(publicColumns)
        .from(formationCourses)
        .innerJoin(courses, eq(courses.id, formationCourses.courseId))
        .innerJoin(courseTranslations, and(eq(courseTranslations.courseId, courses.id), eq(courseTranslations.locale, locale)))
        .where(and(eq(formationCourses.formationId, formationId), eq(courses.status, "PUBLISHED"), tenantScope(organizationId)))
        .orderBy(asc(formationCourses.position)),
    ).pipe(Effect.map((rows): CoursePublicDTO[] => rows)),
  /**
   * @param viewerId lecteur connecté, ou null pour un visiteur anonyme : un
   *   visiteur ne voit que le publié. Les données dépendant de la session ne
   *   doivent pas passer par un cache public.
   */
  byId: (id: string, viewerId: string | null) =>
    dbTry("courses.byId", () =>
      getDrizzle()
        .select({ id: courses.id, slug: courses.slug, title: courses.title, status: courses.status })
        .from(courses)
        .where(viewerId ? eq(courses.id, id) : and(eq(courses.id, id), eq(courses.status, "PUBLISHED")))
        .limit(1),
    ).pipe(Effect.map((rows): CoursesDTO | null => rows[0] ?? null)),
};

/** Adaptateur Promise (pages Astro). */
export const loadCourses = (id: string, viewerId: string | null): Promise<CoursesDTO | null> =>
  runOrThrow(coursesLoader.byId(id, viewerId));

/** Adaptateurs Promise des lectures publiques. */
export const loadPublishedCourseBySlug = (locale: Locale, slug: string, organizationId: string | null = null) =>
  runOrThrow(coursesLoader.publishedBySlug(locale, slug, organizationId));
export const loadPublishedCourses = (locale: Locale, organizationId: string | null = null, limit?: number) =>
  runOrThrow(coursesLoader.listPublished(locale, organizationId, limit));
export const loadCourseLessons = (courseId: string, locale: Locale) =>
  runOrThrow(coursesLoader.lessons(courseId, locale));
export const loadPublishedCoursesByFormation = (formationId: string, locale: Locale, organizationId: string | null = null) =>
  runOrThrow(coursesLoader.publishedByFormation(formationId, locale, organizationId));
