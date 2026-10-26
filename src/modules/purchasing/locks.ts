/**
 * Verrou d'édition des commandes fournisseur, déclaré auprès du verrou générique `src/core/locks` :
 * politique utilisateur + session, reprise par soi (`takeOver`), TTL, erreurs typées.
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { defineLockResource, drizzleLockStore } from "@/core/locks/service";
import { purchasing, purchasingOrderLocks } from "./schema";

export const purchasingLock = defineLockResource("purchasing", drizzleLockStore("purchasing", purchasingOrderLocks, "resourceId"), {
  tenantOf: (id) =>
    dbTry("purchasing.lockTenant", () =>
      getDrizzle().select({ organizationId: purchasing.organizationId }).from(purchasing).where(eq(purchasing.id, id)).limit(1),
    ).pipe(Effect.map((rows) => (rows[0] ? rows[0].organizationId : undefined))),
});
