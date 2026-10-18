/**
 * Libération administrative d'un verrou d'édition (toute ressource enregistrée dans
 * `src/core/locks`) : administrateur global → toute ressource ; propriétaire/administrateur
 * d'organisation → ressources de SA seule organisation (contrôle `core/permissions/tenant`).
 * Chaque libération est auditée (`LOCK_FORCE_RELEASE` : ressource, organisation, ancien propriétaire).
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { adminReleaseLock } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { effectHandler, requireUser } from "@/lib/effect/action";
import { extractIp, logAuditEvent } from "@/lib/audit";

// Enregistrement automatique de tous les verrous de modules (`src/modules/*/locks.ts`, effet de bord
// de `defineLockResource`) : un module généré par `pnpm module:new` est couvert sans modification ici.
import.meta.glob("/src/modules/*/locks.ts", { eager: true });
// Pages CMS (hors modules).
import "@/lib/pages/locks";

export const forceReleaseLock = defineAction({
  input: z.object({ resourceType: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), resourceId: z.string().min(1).max(128) }),
  handler: effectHandler((input, context) =>
    Effect.gen(function* () {
      const user = yield* requireUser(context);
      const released = yield* adminReleaseLock({ ...input, actor: user, locale: lockLocaleFrom(context.request.headers) });
      void logAuditEvent({
        userId: user.id,
        action: "LOCK_FORCE_RELEASE",
        resource: input.resourceType,
        resourceId: input.resourceId,
        metadata: {
          organizationId: released.organizationId,
          previousOwner: released.previousOwner && { userId: released.previousOwner.userId, sessionId: released.previousOwner.sessionId, expiresAt: released.previousOwner.expiresAt.toISOString() },
        },
        ipAddress: extractIp(context.request.headers, context.clientAddress),
        userAgent: context.request.headers.get("user-agent"),
      }).catch(() => {});
      return { released: released.previousOwner !== null, previousOwnerId: released.previousOwner?.userId ?? null };
    }),
  ),
});
