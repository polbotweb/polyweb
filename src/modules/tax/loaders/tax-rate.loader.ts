/**
 * Lecture du domaine tax.
 *
 * SEUL endroit autorisé à LIRE la base pour ce domaine (les écritures passent par
 * `services/`). Chaque lecture est un Effect (`dbTry` → DbError typé) ;
 * `loadTax` en est l'adaptateur Promise pour les pages Astro. Les composants
 * reçoivent des DTO, jamais des lignes brutes.
 */
import { Effect } from "effect";
import { and, eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { tax } from "../schema";

/** DTO public du domaine. */
export interface TaxDTO {
  id: string;
  slug: string;
  title: string;
  status: string;
}

export const taxLoader = {
  /**
   * @param viewerId lecteur connecté, ou null pour un visiteur anonyme : un
   *   visiteur ne voit que le publié. Les données dépendant de la session ne
   *   doivent pas passer par un cache public.
   */
  byId: (id: string, viewerId: string | null) =>
    dbTry("tax.byId", () =>
      getDrizzle()
        .select({ id: tax.id, slug: tax.slug, title: tax.title, status: tax.status })
        .from(tax)
        .where(viewerId ? eq(tax.id, id) : and(eq(tax.id, id), eq(tax.status, "PUBLISHED")))
        .limit(1),
    ).pipe(Effect.map((rows): TaxDTO | null => rows[0] ?? null)),
};

/** Adaptateur Promise (pages Astro). */
export const loadTax = (id: string, viewerId: string | null): Promise<TaxDTO | null> =>
  runOrThrow(taxLoader.byId(id, viewerId));
