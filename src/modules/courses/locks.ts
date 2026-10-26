/**
 * Verrou d'édition du domaine courses, déclaré auprès du verrou générique
 * `src/core/locks` : politique utilisateur + session, reprise par soi depuis
 * une autre session (`takeOver`), TTL, purge des verrous expirés, erreurs typées.
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { defineLockResource, drizzleLockStore } from "@/core/locks/service";
import { courses, courseLocks } from "./schema";

export const coursesLock = defineLockResource("courses", drizzleLockStore("courses", courseLocks, "resourceId"), {
  // Organisation propriétaire : libération administrative réservée à l'administrateur global
  // ou aux owner/admin de CETTE organisation (action générique `forceReleaseLock`, auditée).
  tenantOf: (id) =>
    dbTry("courses.lockTenant", () => getDrizzle().select({ organizationId: courses.organizationId }).from(courses).where(eq(courses.id, id)).limit(1)).pipe(
      Effect.map((rows) => (rows[0] ? rows[0].organizationId : undefined)),
    ),
});
