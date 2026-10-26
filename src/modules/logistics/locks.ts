/**
 * Verrou d'édition des expéditions, déclaré auprès du verrou générique `src/core/locks` :
 * politique utilisateur + session, reprise par soi (`takeOver`), TTL, erreurs typées.
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { defineLockResource, drizzleLockStore } from "@/core/locks/service";
import { logistics, logisticsShipmentLocks } from "./schema";

export const logisticsLock = defineLockResource("logistics", drizzleLockStore("logistics", logisticsShipmentLocks, "resourceId"), {
  tenantOf: (id) =>
    dbTry("logistics.lockTenant", () =>
      getDrizzle().select({ organizationId: logistics.organizationId }).from(logistics).where(eq(logistics.id, id)).limit(1),
    ).pipe(Effect.map((rows) => (rows[0] ? rows[0].organizationId : undefined))),
});
