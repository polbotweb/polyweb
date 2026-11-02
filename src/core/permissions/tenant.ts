/**
 * Administration par tenant (core) : qui peut administrer une ressource appartenant
 * à une organisation (ou à la plateforme, `organizationId = null`).
 *
 * - administrateur global (`user.role` contient `admin`, compte non suspendu) : toute ressource ;
 * - propriétaire / administrateur d'organisation (`member.role` contient `owner` ou `admin`) :
 *   uniquement les ressources de SA propre organisation ;
 * - les ressources plateforme (`organizationId = null`) restent réservées aux administrateurs globaux.
 */
import { Effect } from 'effect';
import { and, eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@/database/drizzle';
import { member, organizationRole } from '@/database/schemas';
import { dbTry } from '@/lib/effect/run';

export interface TenantActor {
  readonly id: string;
  readonly role?: string | null;
  readonly banned?: boolean | null;
}

export const ORGANIZATION_ADMIN_ROLES = ['owner', 'admin'] as const;

const roles = (raw: string | null | undefined) => (raw ?? '').split(',').map((r) => r.trim()).filter(Boolean);

export const isGlobalAdmin = (actor: TenantActor | null | undefined): boolean =>
  !!actor && !actor.banned && roles(actor.role).includes('admin');

export const isOrganizationAdminRole = (memberRole: string | null | undefined): boolean =>
  roles(memberRole).some((r) => (ORGANIZATION_ADMIN_ROLES as readonly string[]).includes(r));

/** Décision pure (testable) : `organizationRole` = rôle de l'acteur dans l'organisation de la ressource. */
export function tenantAdminDecision(input: { actor: TenantActor | null | undefined; organizationId: string | null; organizationRole: string | null }): boolean {
  if (!input.actor || input.actor.banned) return false;
  if (isGlobalAdmin(input.actor)) return true;
  if (input.organizationId === null) return false;
  return isOrganizationAdminRole(input.organizationRole);
}

/** Rôle de l'utilisateur dans l'organisation (`null` si non membre). */
export const organizationRoleOf = (userId: string, organizationId: string) =>
  dbTry('permissions.organizationRole', () =>
    getDrizzle().select({ role: member.role }).from(member).where(and(eq(member.userId, userId), eq(member.organizationId, organizationId))).limit(1),
  ).pipe(Effect.map((rows) => rows[0]?.role ?? null));

/** L'acteur peut-il administrer une ressource de cette organisation (null = plateforme) ? */
export const canAdministerTenant = (actor: TenantActor | null | undefined, organizationId: string | null) =>
  Effect.gen(function* () {
    if (!actor || actor.banned) return false;
    if (isGlobalAdmin(actor)) return true;
    if (organizationId === null) return false;
    const organizationRole = yield* organizationRoleOf(actor.id, organizationId);
    return tenantAdminDecision({ actor, organizationId, organizationRole });
  });

// ─── Rôles fins d'organisation (rôles dynamiques Better Auth, table organization_role) ───

export type PermissionSet = Readonly<Record<string, readonly string[]>>;

/** Rôles prédéfinis de membre qui n'ouvrent AUCUN accès aux données des modules (comportement historique). */
const BUILTIN_MEMBER_ROLES = ['member'] as const;

/** Découpe `member.role` (liste séparée par des virgules, comme Better Auth). */
export const splitRoles = roles;

/** `granted` couvre-t-il toutes les actions demandées ? */
export const coversPermissions = (granted: PermissionSet, requested: PermissionSet): boolean =>
  Object.entries(requested).every(([ns, actions]) => actions.every((a) => (granted[ns] ?? []).includes(a)));

/** Union des permissions de plusieurs rôles dynamiques. */
export const unionPermissions = (sets: readonly PermissionSet[]): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const set of sets) for (const [ns, actions] of Object.entries(set)) out[ns] = [...new Set([...(out[ns] ?? []), ...actions])];
  return out;
};

export type TenantDenyReason = 'unauthenticated' | 'banned' | 'platform' | 'not-member' | 'insufficient-role';
export type TenantDecision = { readonly allowed: true; readonly via: 'global-admin' | 'org-admin' | 'org-role' } | { readonly allowed: false; readonly reason: TenantDenyReason };

/**
 * Décision pure (testable) pour une ressource d'organisation, rôles fins inclus :
 * - administrateur global → tout ; acteur absent / suspendu → refus ;
 * - ressource plateforme → hors de cette décision (RBAC global, voir l'appelant) ;
 * - propriétaire / administrateur de l'organisation → tout dans SON organisation (inchangé) ;
 * - autre rôle : permissions des rôles DYNAMIQUES de l'organisation (`dynamicRoles`) uniquement ;
 *   le rôle prédéfini `member` seul n'ouvre rien (rétrocompatible).
 */
export function tenantPermissionDecision(input: {
  actor: TenantActor | null | undefined;
  organizationId: string | null;
  organizationRole: string | null;
  dynamicRoles: Readonly<Record<string, PermissionSet>>;
  permissions: PermissionSet;
}): TenantDecision {
  if (!input.actor) return { allowed: false, reason: 'unauthenticated' };
  if (input.actor.banned) return { allowed: false, reason: 'banned' };
  if (isGlobalAdmin(input.actor)) return { allowed: true, via: 'global-admin' };
  if (input.organizationId === null) return { allowed: false, reason: 'platform' };
  if (input.organizationRole === null) return { allowed: false, reason: 'not-member' };
  if (isOrganizationAdminRole(input.organizationRole)) return { allowed: true, via: 'org-admin' };
  const custom = roles(input.organizationRole)
    .filter((r) => !(BUILTIN_MEMBER_ROLES as readonly string[]).includes(r) || r in input.dynamicRoles)
    .map((r) => input.dynamicRoles[r])
    .filter((p): p is PermissionSet => !!p);
  return custom.length > 0 && coversPermissions(unionPermissions(custom), input.permissions)
    ? { allowed: true, via: 'org-role' }
    : { allowed: false, reason: 'insufficient-role' };
}

/** Permissions des rôles dynamiques de l'organisation (JSON invalide → rôle ignoré, jamais d'élévation). */
export const dynamicRolesOf = (organizationId: string, roleNames: readonly string[]) =>
  roleNames.length === 0
    ? Effect.succeed({} as Record<string, PermissionSet>)
    : dbTry('permissions.dynamicRoles', () =>
        getDrizzle()
          .select({ role: organizationRole.role, permission: organizationRole.permission })
          .from(organizationRole)
          .where(and(eq(organizationRole.organizationId, organizationId), inArray(organizationRole.role, [...roleNames]))),
      ).pipe(Effect.map((rows) => Object.fromEntries(rows.flatMap((r) => {
        const parsed = parsePermissionSet(r.permission);
        return parsed ? [[r.role, parsed] as const] : [];
      }))));

/** Parse strict d'un ensemble de permissions stocké (Record<string, string[]>). */
export function parsePermissionSet(raw: string): PermissionSet | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    for (const v of Object.values(value)) if (!Array.isArray(v) || !v.every((a) => typeof a === 'string')) return null;
    return value as PermissionSet;
  } catch {
    return null;
  }
}

/** Décision complète (lecture du rôle du membre et des rôles dynamiques de l'organisation). */
export const tenantPermission = (actor: TenantActor | null | undefined, organizationId: string, permissions: PermissionSet) =>
  Effect.gen(function* () {
    if (!actor || actor.banned || isGlobalAdmin(actor)) {
      return tenantPermissionDecision({ actor, organizationId, organizationRole: null, dynamicRoles: {}, permissions });
    }
    const organizationRole = yield* organizationRoleOf(actor.id, organizationId);
    const dynamicRoles = organizationRole && !isOrganizationAdminRole(organizationRole) ? yield* dynamicRolesOf(organizationId, roles(organizationRole)) : {};
    return tenantPermissionDecision({ actor, organizationId, organizationRole, dynamicRoles, permissions });
  });
