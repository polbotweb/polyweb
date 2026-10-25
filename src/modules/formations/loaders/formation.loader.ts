/**
 * Lecture du domaine formations.
 *
 * SEUL endroit autorisé à LIRE la base pour ce domaine (les écritures passent par
 * `services/`). Chaque lecture est un Effect (`dbTry` → DbError typé) ;
 * `loadFormations` en est l'adaptateur Promise pour les pages Astro. Les composants
 * reçoivent des DTO, jamais des lignes brutes.
 */
import { Effect } from "effect";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import type { Locale } from "@i18n/config";
import { formations, formationTranslations, type FormationLevel } from "../schema";

/** DTO public du domaine. */
export interface FormationsDTO {
  id: string;
  slug: string;
  title: string;
  status: string;
}

/** DTO public localisé (page détail / cartes). */
export interface FormationPublicDTO {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  objectives: string | null;
  prerequisites: string | null;
  level: FormationLevel | null;
  durationHours: number | null;
  priceMinor: number | null;
  currency: string | null;
  certificate: boolean;
  coverImageId: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

const publicColumns = {
  id: formations.id,
  slug: formationTranslations.slug,
  title: formationTranslations.title,
  excerpt: formationTranslations.excerpt,
  content: formationTranslations.content,
  objectives: formationTranslations.objectives,
  prerequisites: formationTranslations.prerequisites,
  level: formations.level,
  durationHours: formations.durationHours,
  priceMinor: formations.priceMinor,
  currency: formations.currency,
  certificate: formations.certificate,
  coverImageId: formations.coverImageId,
  metaTitle: formationTranslations.metaTitle,
  metaDescription: formationTranslations.metaDescription,
};

/**
 * Portée tenant EXPLICITE : `organizationId` null = contenu global, jamais de
 * repli silencieux d'une organisation vers le global (TODO §21).
 */
const tenantScope = (organizationId: string | null) =>
  organizationId ? eq(formations.organizationId, organizationId) : isNull(formations.organizationId);

export const formationsLoader = {
  /** Élément publié par slug localisé (relationnel, sans repli de locale). */
  publishedBySlug: (locale: Locale, slug: string, organizationId: string | null) =>
    dbTry("formations.publishedBySlug", () =>
      getDrizzle()
        .select(publicColumns)
        .from(formationTranslations)
        .innerJoin(formations, eq(formations.id, formationTranslations.formationId))
        .where(and(
          eq(formationTranslations.locale, locale),
          eq(formationTranslations.slug, slug),
          eq(formations.status, "PUBLISHED"),
          tenantScope(organizationId),
        ))
        .limit(1),
    ).pipe(Effect.map((rows): FormationPublicDTO | null => rows[0] ?? null)),
  /** Éléments publiés d'une locale. */
  listPublished: (locale: Locale, organizationId: string | null, limit = 50) =>
    dbTry("formations.listPublished", () =>
      getDrizzle()
        .select(publicColumns)
        .from(formationTranslations)
        .innerJoin(formations, eq(formations.id, formationTranslations.formationId))
        .where(and(
          eq(formationTranslations.locale, locale),
          eq(formations.status, "PUBLISHED"),
          tenantScope(organizationId),
        ))
        .orderBy(asc(formations.title))
        .limit(limit),
    ).pipe(Effect.map((rows): FormationPublicDTO[] => rows)),
  /**
   * @param viewerId lecteur connecté, ou null pour un visiteur anonyme : un
   *   visiteur ne voit que le publié. Les données dépendant de la session ne
   *   doivent pas passer par un cache public.
   */
  byId: (id: string, viewerId: string | null) =>
    dbTry("formations.byId", () =>
      getDrizzle()
        .select({ id: formations.id, slug: formations.slug, title: formations.title, status: formations.status })
        .from(formations)
        .where(viewerId ? eq(formations.id, id) : and(eq(formations.id, id), eq(formations.status, "PUBLISHED")))
        .limit(1),
    ).pipe(Effect.map((rows): FormationsDTO | null => rows[0] ?? null)),
};

/** Adaptateur Promise (pages Astro). */
export const loadFormations = (id: string, viewerId: string | null): Promise<FormationsDTO | null> =>
  runOrThrow(formationsLoader.byId(id, viewerId));

/** Adaptateurs Promise des lectures publiques. */
export const loadPublishedFormationBySlug = (locale: Locale, slug: string, organizationId: string | null = null) =>
  runOrThrow(formationsLoader.publishedBySlug(locale, slug, organizationId));
export const loadPublishedFormations = (locale: Locale, organizationId: string | null = null, limit?: number) =>
  runOrThrow(formationsLoader.listPublished(locale, organizationId, limit));
