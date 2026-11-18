/**
 * Verrou d'édition du domaine banking, déclaré auprès du verrou générique
 * `src/core/locks` : politique utilisateur + session, reprise par soi depuis
 * une autre session (`takeOver`), TTL, purge des verrous expirés, erreurs typées.
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { defineLockResource, drizzleLockStore } from "@/core/locks/service";
import { banking, statementLocks } from "./schema";

export const bankingLock = defineLockResource("banking", drizzleLockStore("banking", statementLocks, "resourceId"), {
  // Organisation propriétaire : libération administrative réservée à l'administrateur global
  // ou aux owner/admin de CETTE organisation (action générique `forceReleaseLock`, auditée).
  tenantOf: (id) =>
    dbTry("banking.lockTenant", () => getDrizzle().select({ organizationId: banking.organizationId }).from(banking).where(eq(banking.id, id)).limit(1)).pipe(
      Effect.map((rows) => (rows[0] ? rows[0].organizationId : undefined)),
    ),
});
