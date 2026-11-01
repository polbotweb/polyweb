/**
 * Gardes de permission Effect du domaine subscriptions, tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → les données
 * de SA organisation uniquement ; données plateforme (`organizationId = null`) → RBAC global.
 * Namespace « subscriptions » déclaré dans `src/lib/permissions`. Le client final n'a aucune
 * permission : ses actions (résilier / reprendre) passent par un contrôle de propriété (portail).
 */
import type { ActionAPIContext } from "astro:actions";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { subscriptionPlans, subscriptionPrices, subscriptions } from "../schema";

export const SUBSCRIPTIONS_PERMISSIONS = ["create", "read", "update", "delete"] as const;
export type SubscriptionsPermission = (typeof SUBSCRIPTIONS_PERMISSIONS)[number];

export const SUBSCRIPTIONS_RESOURCES = { subscription: subscriptions, plan: subscriptionPlans, price: subscriptionPrices } as const;
export type SubscriptionsResource = keyof typeof SUBSCRIPTIONS_RESOURCES;

/** Données de l'organisation `organizationId` (`null` = plateforme) : création. */
export const requireSubscriptionsPermission = (context: ActionAPIContext, permissions: readonly SubscriptionsPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { subscriptions: [...permissions] }, organizationId);

/** Élément existant : son organisation est lue en base (introuvable → NOT_FOUND) avant la garde tenant. */
export const requireSubscriptionsResourcePermission = (context: ActionAPIContext, permissions: readonly SubscriptionsPermission[], id: string, resource: SubscriptionsResource = "subscription") => {
  const table = SUBSCRIPTIONS_RESOURCES[resource];
  return requireTenantResourcePermission(context, { subscriptions: [...permissions] }, () =>
    getDrizzle().select({ organizationId: table.organizationId }).from(table).where(eq(table.id, id)).limit(1),
  );
};

/** Page back-office : RBAC global (`userHasPermission`) ; toute erreur → refus. */
export const hasSubscriptionsPermissionEffect = (context: Pick<ActionAPIContext, "locals">, permissions: readonly SubscriptionsPermission[]): Effect.Effect<boolean> => {
  const currentUser = context.locals.user;
  if (!currentUser || currentUser.banned) return Effect.succeed(false);
  return Effect.tryPromise(async () => {
    const { auth } = await import("@/lib/auth");
    const result = await auth.api.userHasPermission({ body: { userId: currentUser.id, permissions: { subscriptions: [...permissions] } } });
    return result.success;
  }).pipe(Effect.orElseSucceed(() => false));
};
export const hasSubscriptionsPermission = (context: Pick<ActionAPIContext, "locals">, permissions: readonly SubscriptionsPermission[]): Promise<boolean> =>
  Effect.runPromise(hasSubscriptionsPermissionEffect(context, permissions));
