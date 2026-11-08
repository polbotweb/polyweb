/**
 * Cibles qu'un utilisateur peut modérer dans une portée (plateforme `null` ou organisation) :
 * permission de chaque adaptateur, évaluée séparément (pages de modération, badges).
 */
import { Effect } from "effect";
import { isGlobalAdmin, tenantPermission, type TenantActor } from "@/core/permissions/tenant";
import { listModerationTargets, type RegisteredModerationTarget } from "@/core/moderation/registry";

type Actor = TenantActor & { readonly id: string };

const platformAllowed = (actor: Actor, target: RegisteredModerationTarget) =>
  actor.banned
    ? Effect.succeed(false)
    : isGlobalAdmin(actor)
    ? Effect.succeed(true)
    : Effect.tryPromise(() =>
        import("@/lib/auth").then((m) => m.auth.api.userHasPermission({ body: { userId: actor.id, permissions: target.permission as Record<string, string[]> } })),
      ).pipe(
        Effect.map((r) => r.success === true),
        Effect.catch(() => Effect.succeed(false)),
      );

export const moderatorTargets = (actor: Actor | null | undefined, organizationId: string | null) =>
  Effect.gen(function* () {
    if (!actor) return [] as RegisteredModerationTarget[];
    const checks = yield* Effect.forEach(listModerationTargets(), (target) =>
      (organizationId === null
        ? platformAllowed(actor, target)
        : tenantPermission(actor, organizationId, target.permission).pipe(
            Effect.map((d) => d.allowed),
            Effect.catch(() => Effect.succeed(false)),
          )
      ).pipe(Effect.map((allowed) => (allowed ? target : null))),
    );
    return checks.filter((t): t is RegisteredModerationTarget => t !== null);
  });
