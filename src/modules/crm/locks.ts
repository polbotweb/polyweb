/**
 * Verrou d'édition des opportunités, déclaré auprès du verrou générique `src/core/locks` :
 * politique utilisateur + session, reprise par soi (`takeOver`), TTL, erreurs typées.
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { defineLockResource, drizzleLockStore } from "@/core/locks/service";
import { crm, crmOpportunityLocks } from "./schema";

export const crmLock = defineLockResource("crm", drizzleLockStore("crm", crmOpportunityLocks, "resourceId"), {
  tenantOf: (id) =>
    dbTry("crm.lockTenant", () => getDrizzle().select({ organizationId: crm.organizationId }).from(crm).where(eq(crm.id, id)).limit(1)).pipe(
      Effect.map((rows) => (rows[0] ? rows[0].organizationId : undefined)),
    ),
});
