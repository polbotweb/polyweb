/**
 * Gardes de permission Effect du domaine crm, tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → les données
 * de SA organisation uniquement ; données plateforme (`organizationId = null`) → RBAC global.
 * Namespace « crm » déclaré dans `src/lib/permissions`.
 */
import type { ActionAPIContext } from "astro:actions";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { crm, crmActivities, crmCompanies, crmContacts } from "../schema";

export const CRM_PERMISSIONS = ["create", "read", "update", "delete"] as const;
export type CrmPermission = (typeof CRM_PERMISSIONS)[number];

/** Ressources du module dont l'organisation se lit en base. */
export const CRM_RESOURCES = { opportunity: crm, company: crmCompanies, contact: crmContacts, activity: crmActivities } as const;
export type CrmResource = keyof typeof CRM_RESOURCES;

/** Données de l'organisation `organizationId` (`null` = plateforme) : création, actions groupées. */
export const requireCrmPermission = (context: ActionAPIContext, permissions: readonly CrmPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { crm: [...permissions] }, organizationId);

/** Élément existant : son organisation est lue en base (introuvable → NOT_FOUND) avant la garde tenant. */
export const requireCrmResourcePermission = (context: ActionAPIContext, permissions: readonly CrmPermission[], id: string, resource: CrmResource = "opportunity") => {
  const table = CRM_RESOURCES[resource];
  return requireTenantResourcePermission(context, { crm: [...permissions] }, () =>
    getDrizzle().select({ organizationId: table.organizationId }).from(table).where(eq(table.id, id)).limit(1),
  );
};

/** Page back-office : RBAC global (`userHasPermission`) ; toute erreur → refus. */
export const hasCrmPermissionEffect = (context: Pick<ActionAPIContext, "locals">, permissions: readonly CrmPermission[]): Effect.Effect<boolean> => {
  const currentUser = context.locals.user;
  if (!currentUser || currentUser.banned) return Effect.succeed(false);
  return Effect.tryPromise(async () => {
    const { auth } = await import("@/lib/auth");
    const result = await auth.api.userHasPermission({ body: { userId: currentUser.id, permissions: { crm: [...permissions] } } });
    return result.success;
  }).pipe(Effect.orElseSucceed(() => false));
};
export const hasCrmPermission = (context: Pick<ActionAPIContext, "locals">, permissions: readonly CrmPermission[]): Promise<boolean> =>
  Effect.runPromise(hasCrmPermissionEffect(context, permissions));
