/**
 * Gestion des accès par site (C3-A) : un membre sans ligne garde l'accès à tous les sites de
 * l'organisation ; dès qu'il a une ligne, il est limité aux sites listés (rôle propre facultatif).
 * Tout est strictement borné à l'organisation : un site ou un membre d'une autre organisation
 * est traité comme introuvable (pas de fuite d'existence, pas d'IDOR).
 */
import { Effect } from 'effect';
import { and, asc, eq } from 'drizzle-orm';
import { getDrizzle } from '@/database/drizzle';
import { member, organizationRole, siteAccess, sites, user } from '@/database/schemas';
import { dbTry } from '@/lib/effect/run';
import { splitRoles as roles } from '@/core/permissions/tenant';

export const BUILTIN_SITE_ROLES = ['admin', 'member'] as const;

export interface SiteAccessEntry {
  readonly id: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly userId: string;
  readonly userName: string;
  readonly role: string | null;
}

export type SiteAccessFailure = 'not-found' | 'owner' | 'role';
export type GrantResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly reason: SiteAccessFailure };

/** Rôle accepté pour une ligne : vide (= rôle d'organisation), admin, member ou un rôle dynamique de l'org (pur). */
export function isAssignableSiteRole(role: string | null, dynamicRoleNames: readonly string[]): boolean {
  if (role === null) return true;
  return (BUILTIN_SITE_ROLES as readonly string[]).includes(role) || dynamicRoleNames.includes(role);
}

export const organizationSites = (organizationId: string) =>
  dbTry('siteAccess.sites', () =>
    getDrizzle().select({ id: sites.id, name: sites.name }).from(sites).where(eq(sites.organizationId, organizationId)).orderBy(asc(sites.name)),
  );

export const organizationRoleNames = (organizationId: string) =>
  dbTry('siteAccess.roles', () =>
    getDrizzle().select({ role: organizationRole.role }).from(organizationRole).where(eq(organizationRole.organizationId, organizationId)),
  ).pipe(Effect.map((rows) => rows.map((r) => r.role)));

export const listSiteAccess = (organizationId: string) =>
  dbTry('siteAccess.list', () =>
    getDrizzle()
      .select({ id: siteAccess.id, siteId: siteAccess.siteId, siteName: sites.name, userId: siteAccess.userId, userName: user.name, role: siteAccess.role })
      .from(siteAccess)
      .innerJoin(sites, eq(sites.id, siteAccess.siteId))
      .innerJoin(user, eq(user.id, siteAccess.userId))
      .where(eq(siteAccess.organizationId, organizationId))
      .orderBy(asc(user.name), asc(sites.name)),
  ) as Effect.Effect<SiteAccessEntry[], unknown>;

/** Ajoute (ou met à jour) l'accès d'un membre à un site de la même organisation. */
export const grantSiteAccess = (input: { organizationId: string; siteId: string; userId: string; role: string | null; createdBy: string }) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const [site] = yield* dbTry('siteAccess.site', () =>
      db.select({ id: sites.id }).from(sites).where(and(eq(sites.id, input.siteId), eq(sites.organizationId, input.organizationId))).limit(1),
    );
    const [m] = yield* dbTry('siteAccess.member', () =>
      db.select({ role: member.role }).from(member).where(and(eq(member.userId, input.userId), eq(member.organizationId, input.organizationId))).limit(1),
    );
    if (!site || !m) return { ok: false, reason: 'not-found' } as GrantResult;
    if (roles(m.role).includes('owner')) return { ok: false, reason: 'owner' } as GrantResult;
    const role = input.role?.trim() ? input.role.trim() : null;
    if (!isAssignableSiteRole(role, yield* organizationRoleNames(input.organizationId))) return { ok: false, reason: 'role' } as GrantResult;
    const [row] = yield* dbTry('siteAccess.upsert', () =>
      db
        .insert(siteAccess)
        .values({ organizationId: input.organizationId, siteId: input.siteId, userId: input.userId, role, createdBy: input.createdBy })
        .onConflictDoUpdate({ target: [siteAccess.siteId, siteAccess.userId], set: { role } })
        .returning({ id: siteAccess.id }),
    );
    return { ok: true, id: row?.id ?? '' } as GrantResult;
  });

/** Retire une ligne d'accès ; une ligne d'une autre organisation est introuvable. */
export const revokeSiteAccess = (organizationId: string, id: string) =>
  dbTry('siteAccess.revoke', () =>
    getDrizzle()
      .delete(siteAccess)
      .where(and(eq(siteAccess.id, id), eq(siteAccess.organizationId, organizationId)))
      .returning({ id: siteAccess.id, siteId: siteAccess.siteId, userId: siteAccess.userId }),
  ).pipe(Effect.map((rows) => rows[0] ?? null));
