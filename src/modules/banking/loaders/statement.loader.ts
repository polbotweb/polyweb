/**
 * Lecture du domaine banking.
 *
 * SEUL endroit autorisé à LIRE la base pour ce domaine (les écritures passent par
 * `services/`). Chaque lecture est un Effect (`dbTry` → DbError typé) ;
 * `loadBanking` en est l'adaptateur Promise pour les pages Astro. Les composants
 * reçoivent des DTO, jamais des lignes brutes.
 */
import { Effect } from "effect";
import { and, eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { banking } from "../schema";

/** DTO public du domaine. */
export interface BankingDTO {
  id: string;
  slug: string;
  title: string;
  status: string;
}

export const bankingLoader = {
  /**
   * @param viewerId lecteur connecté, ou null pour un visiteur anonyme : un
   *   visiteur ne voit que le publié. Les données dépendant de la session ne
   *   doivent pas passer par un cache public.
   */
  byId: (id: string, viewerId: string | null) =>
    dbTry("banking.byId", () =>
      getDrizzle()
        .select({ id: banking.id, slug: banking.slug, title: banking.title, status: banking.status })
        .from(banking)
        .where(viewerId ? eq(banking.id, id) : and(eq(banking.id, id), eq(banking.status, "PUBLISHED")))
        .limit(1),
    ).pipe(Effect.map((rows): BankingDTO | null => rows[0] ?? null)),
};

/** Adaptateur Promise (pages Astro). */
export const loadBanking = (id: string, viewerId: string | null): Promise<BankingDTO | null> =>
  runOrThrow(bankingLoader.byId(id, viewerId));
