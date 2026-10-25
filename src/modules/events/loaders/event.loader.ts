/**
 * Lecture du domaine events.
 *
 * SEUL endroit autorisé à LIRE la base pour ce domaine (les écritures passent par
 * `services/`). Chaque lecture est un Effect (`dbTry` → DbError typé) ;
 * `loadEvents` en est l'adaptateur Promise pour les pages Astro. Les composants
 * reçoivent des DTO, jamais des lignes brutes.
 */
import { Effect } from "effect";
import { and, eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { events } from "../schema";

/** DTO public du domaine. */
export interface EventsDTO {
  id: string;
  slug: string;
  title: string;
  status: string;
}

export const eventsLoader = {
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
