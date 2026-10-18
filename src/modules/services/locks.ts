/**
 * Verrou d'édition des services : déclaration auprès du verrou générique
 * `src/core/locks` (politique, TTL, purge, erreurs typées et i18n communs).
 */
import { serviceLocks } from "@database/schemas";
import { defineLockResource, drizzleLockStore } from "@/core/locks/service";

export const SERVICE_LOCK_TTL_MS = 30 * 60 * 1000;

export const serviceLock = defineLockResource("service", drizzleLockStore("service", serviceLocks, "serviceId"), { ttlMs: SERVICE_LOCK_TTL_MS });
