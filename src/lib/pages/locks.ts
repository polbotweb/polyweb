/**
 * Verrou d'édition des pages CMS : déclaration auprès du verrou générique `src/core/locks`
 * (propriétaire utilisateur + session, reprise par soi depuis une autre session, TTL, purge,
 * libération administrative). Les pages n'ont pas d'organisation : `tenantOf` renvoie `null`
 * (plateforme → libération réservée aux administrateurs globaux) ou `undefined` (page absente).
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { pageLocks, pages } from "@database/schemas";
import { dbTry } from "@/lib/effect/run";
import { defineLockResource, drizzleLockStore } from "@/core/locks/service";

/** 5 minutes d'inactivité, comme l'ancienne implémentation (renouvelé par l'éditeur). */
export const PAGE_LOCK_TTL_MS = 5 * 60 * 1000;

export const pageLock = defineLockResource("page", drizzleLockStore("page", pageLocks, "pageId"), {
  ttlMs: PAGE_LOCK_TTL_MS,
  tenantOf: (id) =>
    dbTry("pages.lockTenant", () => getDrizzle().select({ id: pages.id }).from(pages).where(eq(pages.id, id)).limit(1)).pipe(
      Effect.map((rows) => (rows[0] ? null : undefined)),
    ),
});
