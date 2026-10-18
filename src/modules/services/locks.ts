/**
 * Verrou d'édition des services : déclaration auprès du verrou générique
 * `src/core/locks` (politique, TTL, purge, erreurs typées et i18n communs).
 * `tenantOf` fournit l'organisation propriétaire pour la libération administrative.
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { serviceLocks, services } from "@database/schemas";
import { dbTry } from "@/lib/effect/run";
import { defineLockResource, drizzleLockStore } from "@/core/locks/service";

export const SERVICE_LOCK_TTL_MS = 30 * 60 * 1000;

export const serviceLock = defineLockResource("service", drizzleLockStore("service", serviceLocks, "serviceId"), {
  ttlMs: SERVICE_LOCK_TTL_MS,
  tenantOf: (id) =>
    dbTry("services.lockTenant", () => getDrizzle().select({ organizationId: services.organizationId }).from(services).where(eq(services.id, id)).limit(1)).pipe(
      Effect.map((rows) => (rows[0] ? rows[0].organizationId : undefined)),
    ),
});
