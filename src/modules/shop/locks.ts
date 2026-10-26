/**
 * Verrou d'édition du domaine shop, déclaré auprès du verrou générique
 * `src/core/locks` : politique utilisateur + session, reprise par soi depuis
 * une autre session (`takeOver`), TTL, purge des verrous expirés, erreurs typées.
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { defineLockResource, drizzleLockStore } from "@/core/locks/service";
import { products, productLocks } from "./schema";

export const shopLock = defineLockResource("shop", drizzleLockStore("shop", productLocks, "resourceId"), {
  // Organisation propriétaire : libération administrative réservée à l'administrateur global
  // ou aux owner/admin de CETTE organisation (action générique `forceReleaseLock`, auditée).
  tenantOf: (id) =>
    dbTry("shop.lockTenant", () => getDrizzle().select({ organizationId: products.organizationId }).from(products).where(eq(products.id, id)).limit(1)).pipe(
      Effect.map((rows) => (rows[0] ? rows[0].organizationId : undefined)),
    ),
});
