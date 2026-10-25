/**
 * Lecture du domaine events.
 *
 * SEUL endroit autorisé à LIRE la base pour ce domaine (les écritures passent par
 * `services/`). Chaque lecture est un Effect (`dbTry` → DbError typé) ;
 * `loadEvents` en est l'adaptateur Promise pour les pages Astro. Les composants
 * reçoivent des DTO, jamais des lignes brutes.
 */
import { Effect } from "effect";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import type { Locale } from "@i18n/config";
import { events, eventTranslations } from "../schema";

/** DTO public du domaine. */
export interface EventsDTO {
  id: string;
  slug: string;
  title: string;
  status: string;
}

/** DTO public localisé (page détail / cartes). */
export interface EventPublicDTO {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  venueName: string | null;
  venueAddress: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string | null;
  capacity: number | null;
  priceMinor: number | null;
  currency: string | null;
  coverImageId: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

const publicColumns = {
  id: events.id,
  slug: eventTranslations.slug,
  title: eventTranslations.title,
  excerpt: eventTranslations.excerpt,
  content: eventTranslations.content,
  venueName: eventTranslations.venueName,
  venueAddress: eventTranslations.venueAddress,
  startsAt: events.startsAt,
  endsAt: events.endsAt,
  timezone: events.timezone,
  capacity: events.capacity,
  priceMinor: events.priceMinor,
  currency: events.currency,
  coverImageId: events.coverImageId,
  metaTitle: eventTranslations.metaTitle,
  metaDescription: eventTranslations.metaDescription,
};

/**
 * Portée tenant EXPLICITE : `organizationId` null = contenu global, jamais de
 * repli silencieux d'une organisation vers le global (TODO §21).
 */
const tenantScope = (organizationId: string | null) =>
  organizationId ? eq(events.organizationId, organizationId) : isNull(events.organizationId);

export const eventsLoader = {
  /** Événement publié par slug localisé (relationnel, sans repli de locale). */
  publishedBySlug: (locale: Locale, slug: string, organizationId: string | null) =>
    dbTry("events.publishedBySlug", () =>
      getDrizzle()
        .select(publicColumns)
        .from(eventTranslations)
        .innerJoin(events, eq(events.id, eventTranslations.eventId))
        .where(and(
          eq(eventTranslations.locale, locale),
          eq(eventTranslations.slug, slug),
          eq(events.status, "PUBLISHED"),
          tenantScope(organizationId),
        ))
        .limit(1),
    ).pipe(Effect.map((rows): EventPublicDTO | null => rows[0] ?? null)),
  /** Événements publiés d'une locale, triés par date de début. */
  listPublished: (locale: Locale, organizationId: string | null, limit = 50) =>
    dbTry("events.listPublished", () =>
      getDrizzle()
        .select(publicColumns)
        .from(eventTranslations)
        .innerJoin(events, eq(events.id, eventTranslations.eventId))
        .where(and(
          eq(eventTranslations.locale, locale),
          eq(events.status, "PUBLISHED"),
          tenantScope(organizationId),
        ))
        .orderBy(asc(events.startsAt))
        .limit(limit),
    ).pipe(Effect.map((rows): EventPublicDTO[] => rows)),

  /**
   * @param viewerId lecteur connecté, ou null pour un visiteur anonyme : un
   *   visiteur ne voit que le publié. Les données dépendant de la session ne
   *   doivent pas passer par un cache public.
   */
  byId: (id: string, viewerId: string | null) =>
    dbTry("events.byId", () =>
      getDrizzle()
        .select({ id: events.id, slug: events.slug, title: events.title, status: events.status })
        .from(events)
        .where(viewerId ? eq(events.id, id) : and(eq(events.id, id), eq(events.status, "PUBLISHED")))
        .limit(1),
    ).pipe(Effect.map((rows): EventsDTO | null => rows[0] ?? null)),
};

/** Adaptateur Promise (pages Astro). */
export const loadEvents = (id: string, viewerId: string | null): Promise<EventsDTO | null> =>
  runOrThrow(eventsLoader.byId(id, viewerId));

/** Adaptateurs Promise des lectures publiques. */
export const loadPublishedEventBySlug = (locale: Locale, slug: string, organizationId: string | null = null) =>
  runOrThrow(eventsLoader.publishedBySlug(locale, slug, organizationId));
export const loadPublishedEvents = (locale: Locale, organizationId: string | null = null, limit?: number) =>
  runOrThrow(eventsLoader.listPublished(locale, organizationId, limit));
