/**
 * Lecture du domaine subscriptions.
 *
 * SEUL endroit autorisé à LIRE la base pour ce domaine (les écritures passent par
 * `services/`). Chaque lecture est un Effect (`dbTry` → DbError typé) ;
 * `loadSubscriptions` en est l'adaptateur Promise pour les pages Astro. Les composants
 * reçoivent des DTO, jamais des lignes brutes.
 */
import { Effect } from "effect";
import { and, eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { subscriptions } from "../schema";

/** DTO public du domaine. */
export interface SubscriptionsDTO {
  id: string;
  slug: string;
  title: string;
  status: string;
}

export const subscriptionsLoader = {
  /**
   * @param viewerId lecteur connecté, ou null pour un visiteur anonyme : un
   *   visiteur ne voit que le publié. Les données dépendant de la session ne
   *   doivent pas passer par un cache public.
   */
  byId: (id: string, viewerId: string | null) =>
    dbTry("subscriptions.byId", () =>
      getDrizzle()
        .select({ id: subscriptions.id, slug: subscriptions.slug, title: subscriptions.title, status: subscriptions.status })
        .from(subscriptions)
        .where(viewerId ? eq(subscriptions.id, id) : and(eq(subscriptions.id, id), eq(subscriptions.status, "PUBLISHED")))
        .limit(1),
    ).pipe(Effect.map((rows): SubscriptionsDTO | null => rows[0] ?? null)),
};

/** Adaptateur Promise (pages Astro). */
export const loadSubscriptions = (id: string, viewerId: string | null): Promise<SubscriptionsDTO | null> =>
  runOrThrow(subscriptionsLoader.byId(id, viewerId));
