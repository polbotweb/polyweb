import { Effect } from "effect";
import { actionTry, fail, runGuard } from "@/lib/effect/action";
import { ActionError } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { logAuditEvent, extractIp, type AuditAction } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Vérifie que l'utilisateur est connecté et est admin/owner de l'organisation donnée
 * (admin global toujours autorisé). Échecs `ActionFailure` ; renvoie l'utilisateur non nul.
 */
export const requireOrgAdmin = (context: Pick<ActionAPIContext, "locals" | "request">, organizationId: string) =>
  Effect.gen(function* () {
    const user = context.locals.user;
    if (!user) return yield* fail("UNAUTHORIZED", "Vous devez être connecté pour effectuer cette action.");
    if (user.banned) return yield* fail("FORBIDDEN", "Compte suspendu.");
    if (user.role === "admin") return user;
    const fullOrg = yield* actionTry("auth.getFullOrganization", () =>
      import("@/lib/auth").then(({ auth }) => auth.api.getFullOrganization({ query: { organizationId }, headers: context.request.headers })),
    );
    if (!fullOrg) return yield* fail("NOT_FOUND", "Organisation introuvable.");
    const member = (fullOrg.members ?? []).find((m: { userId: string }) => m.userId === user.id);
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return yield* fail("FORBIDDEN", "Vous devez être propriétaire ou administrateur de cette organisation.");
    }
    return user;
  });

/** Adaptateur Promise de `requireOrgAdmin` (relève `ActionError`). */
export const assertOrgAdmin = (context: ActionAPIContext, organizationId: string) => runGuard(requireOrgAdmin(context, organizationId));

/** Rate-limit org en Effect (mêmes clés que `orgRateLimit`). */
export const orgRateLimitEffect = (userId: string, scope: string, opts = { window: 60, max: 30 }) =>
  Effect.suspend(() =>
    checkRateLimit(`org-${scope.replace(/:/g, "_")}:${userId}`, opts).allowed
      ? Effect.void
      : fail("TOO_MANY_REQUESTS", "Trop de requêtes. Réessayez dans quelques instants."),
  );

/**
 * Applique un rate-limit par IP (ou userId en fallback).
 * Lance une ActionError TOO_MANY_REQUESTS si le seuil est dépassé.
 */
export function orgRateLimit(
  _context: ActionAPIContext,
  userId: string,
  scope: string,
  opts = { window: 60, max: 30 },
) {
  const safeScope = scope.replace(/:/g, '_');
  const rl = checkRateLimit(`org-${safeScope}:${userId}`, opts);
  if (!rl.allowed) {
    throw new ActionError({
      code: "TOO_MANY_REQUESTS",
      message: "Trop de requêtes. Réessayez dans quelques instants.",
    });
  }
}

/**
 * Journalise une action d'administration org dans la table d'audit (non-bloquant).
 */
export function auditOrg(
  context: ActionAPIContext,
  userId: string,
  action: AuditAction,
  opts?: {
    resource?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  void logAuditEvent({
    userId,
    action,
    resource: opts?.resource ?? null,
    resourceId: opts?.resourceId ?? null,
    metadata: opts?.metadata ?? null,
    ipAddress: extractIp(context.request.headers, context.clientAddress),
    userAgent: context.request.headers.get("user-agent"),
  }).catch(() => {});
}
