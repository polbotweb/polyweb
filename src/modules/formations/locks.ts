/**
 * Verrou d'édition du domaine formations, déclaré auprès du verrou générique
 * `src/core/locks` : politique utilisateur + session, reprise par soi depuis
 * une autre session (`takeOver`), TTL, purge des verrous expirés, erreurs typées.
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { defineLockResource, drizzleLockStore } from "@/core/locks/service";
import { formations, formationLocks } from "./schema";

export const formationsLock = defineLockResource("formations", drizzleLockStore("formations", formationLocks, "resourceId"), {
  // Organisation propriétaire : libération administrative réservée à l'administrateur global
  // ou aux owner/admin de CETTE organisation (action générique `forceReleaseLock`, auditée).
  tenantOf: (id) =>
    dbTry("formations.lockTenant", () => getDrizzle().select({ organizationId: formations.organizationId }).from(formations).where(eq(formations.id, id)).limit(1)).pipe(
      Effect.map((rows) => (rows[0] ? rows[0].organizationId : undefined)),
    ),
});
