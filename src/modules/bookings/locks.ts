/**
 * Verrou d'édition des réservations, déclaré auprès du verrou générique `src/core/locks` :
 * politique utilisateur + session, reprise par soi (`takeOver`), TTL, erreurs typées.
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { defineLockResource, drizzleLockStore } from "@/core/locks/service";
import { bookings, bookingsLocks } from "./schema";

export const bookingsLock = defineLockResource("bookings", drizzleLockStore("bookings", bookingsLocks, "resourceId"), {
  tenantOf: (id) =>
    dbTry("bookings.lockTenant", () =>
      getDrizzle().select({ organizationId: bookings.organizationId }).from(bookings).where(eq(bookings.id, id)).limit(1),
    ).pipe(Effect.map((rows) => (rows[0] ? rows[0].organizationId : undefined))),
});
