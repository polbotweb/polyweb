/**
 * Lecture du domaine forums.
 *
 * SEUL endroit autorisé à LIRE la base pour ce domaine (les écritures passent par
 * `services/`). Chaque lecture est un Effect (`dbTry` → DbError typé) ;
 * `loadForums` en est l'adaptateur Promise pour les pages Astro. Les composants
 * reçoivent des DTO, jamais des lignes brutes.
 */
import { Effect } from "effect";
import { and, eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { forums } from "../schema";

/** DTO public du domaine. */
export interface ForumsDTO {
  id: string;
  slug: string;
  title: string;
  status: string;
}

export const forumsLoader = {
  /**
   * @param viewerId lecteur connecté, ou null pour un visiteur anonyme : un
   *   visiteur ne voit que le publié. Les données dépendant de la session ne
   *   doivent pas passer par un cache public.
   */
  byId: (id: string, viewerId: string | null) =>
    dbTry("forums.byId", () =>
      getDrizzle()
        .select({ id: forums.id, slug: forums.slug, title: forums.title, status: forums.status })
        .from(forums)
        .where(viewerId ? eq(forums.id, id) : and(eq(forums.id, id), eq(forums.status, "PUBLISHED")))
        .limit(1),
    ).pipe(Effect.map((rows): ForumsDTO | null => rows[0] ?? null)),
};

/** Adaptateur Promise (pages Astro). */
export const loadForums = (id: string, viewerId: string | null): Promise<ForumsDTO | null> =>
  runOrThrow(forumsLoader.byId(id, viewerId));
