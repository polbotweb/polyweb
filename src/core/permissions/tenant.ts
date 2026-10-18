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
import { and, eq } from 'drizzle-orm';
import { getDrizzle } from '@/database/drizzle';
import { member } from '@/database/schemas';
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
