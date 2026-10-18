import { ActionError } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { logAuditEvent, extractIp, type AuditAction } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Vérifie que l'utilisateur est connecté et est admin/owner de l'organisation donnée.
 * Lance une ActionError si ce n'est pas le cas.
 * Retourne l'utilisateur typé (non-null).
 */
export async function assertOrgAdmin(
  context: ActionAPIContext,
  organizationId: string,
) {
  const user = context.locals.user;
  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "Vous devez être connecté pour effectuer cette action.",
    });
  }
  if (user.banned) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: "Compte suspendu.",
    });
  }

  // Global admins can always manage org roles
  if (user.role === "admin") return user;

  // Check org membership (owner or admin)
  const { auth } = await import("@/lib/auth");
  const fullOrg = await auth.api.getFullOrganization({
    query: { organizationId },
    headers: context.request.headers,
  });

  if (!fullOrg) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "Organisation introuvable.",
    });
  }

  const member = (fullOrg.members ?? []).find(
    (m: { userId: string }) => m.userId === user.id,
  );

  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: "Vous devez être propriétaire ou administrateur de cette organisation.",
    });
  }

  return user;
}

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
