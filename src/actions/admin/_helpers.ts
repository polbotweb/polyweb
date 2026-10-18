import { ActionError } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { logAuditEvent, extractIp, type AuditAction } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import type { statement } from "@/lib/permissions";

type Statement = typeof statement;
type Permissions = { [K in keyof Statement]?: Statement[K][number][] };

/**
 * Vérifie que l'utilisateur est connecté et a le rôle admin.
 * Lance une ActionError si ce n'est pas le cas.
 * Retourne l'utilisateur typé (non-null).
 */
export function assertAdmin(context: ActionAPIContext) {
  const user = context.locals.user;
  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "Vous devez être connecté pour effectuer cette action.",
    });
  }
  if (user.role !== "admin") {
    throw new ActionError({
      code: "FORBIDDEN",
      message: "Accès réservé aux administrateurs.",
    });
  }
  if (user.banned) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: "Compte suspendu.",
    });
  }
  return user;
}

/**
 * Vérifie que l'utilisateur est connecté et a les permissions requises (RBAC).
 * Utilise better-auth `userHasPermission` en passant le rôle directement.
 * Lance une ActionError si ce n'est pas le cas.
 *
 * @see src/lib/permissions.ts — définitions des statements et rôles
 */
export async function assertPermission(
  context: ActionAPIContext,
  permissions: Permissions,
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

  const result = await import("@/lib/auth").then((m) =>
    m.auth.api.userHasPermission({
      body: {
        userId: user.id,
        permissions: permissions as Record<string, string[]>,
      },
    }),
  );

  if (!result.success) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: "Permissions insuffisantes pour cette action.",
    });
  }

  return user;
}

/**
 * Applique un rate-limit par IP (ou userId en fallback).
 * Lance une ActionError TOO_MANY_REQUESTS si le seuil est dépassé.
 */
export function adminRateLimit(
  _context: ActionAPIContext,
  userId: string,
  scope: string,
  opts = { window: 60, max: 30 },
) {
  // Key on userId (always available after assertAdmin) to avoid NAT/shared-IP collisions.
  // Encode scope to prevent key collision if scope contains ':'.
  const safeScope = scope.replace(/:/g, '_');
  const rl = checkRateLimit(`admin-${safeScope}:${userId}`, opts);
  if (!rl.allowed) {
    throw new ActionError({
      code: "TOO_MANY_REQUESTS",
      message: "Trop de requêtes. Veuillez réessayer dans quelques instants.",
    });
  }
}

/**
 * Enregistre un événement d'audit pour une action admin.
 * Appel non-bloquant (void).
 */
export function auditAdmin(
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
  }).catch(() => { /* swallow — audit must never crash the caller */ });
}
