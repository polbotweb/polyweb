/**
 * Gardes de permission Effect du domaine purchasing (achats), tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → les données
 * de SA organisation uniquement ; données plateforme (`organizationId = null`) → RBAC global.
 * Namespace « purchasing » déclaré dans `src/lib/permissions`.
 */
import type { ActionAPIContext } from "astro:actions";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { purchasing, purchasingReceipts, purchasingSuppliers } from "../schema";

export const PURCHASING_PERMISSIONS = ["create", "read", "update", "delete"] as const;
export type PurchasingPermission = (typeof PURCHASING_PERMISSIONS)[number];

/** Ressources du module dont l'organisation se lit en base. */
export const PURCHASING_RESOURCES = { order: purchasing, supplier: purchasingSuppliers, receipt: purchasingReceipts } as const;
export type PurchasingResource = keyof typeof PURCHASING_RESOURCES;

/** Données de l'organisation `organizationId` (`null` = plateforme) : création, actions groupées. */
export const requirePurchasingPermission = (context: ActionAPIContext, permissions: readonly PurchasingPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { purchasing: [...permissions] }, organizationId);

/** Élément existant : son organisation est lue en base (introuvable → NOT_FOUND) avant la garde tenant. */
export const requirePurchasingResourcePermission = (context: ActionAPIContext, permissions: readonly PurchasingPermission[], id: string, resource: PurchasingResource = "order") => {
  const table = PURCHASING_RESOURCES[resource];
  return requireTenantResourcePermission(context, { purchasing: [...permissions] }, () =>
    getDrizzle().select({ organizationId: table.organizationId }).from(table).where(eq(table.id, id)).limit(1),
  );
};

/** Page back-office : RBAC global (`userHasPermission`) ; toute erreur → refus. */
export const hasPurchasingPermissionEffect = (context: Pick<ActionAPIContext, "locals">, permissions: readonly PurchasingPermission[]): Effect.Effect<boolean> => {
  const currentUser = context.locals.user;
  if (!currentUser || currentUser.banned) return Effect.succeed(false);
  return Effect.tryPromise(async () => {
    const { auth } = await import("@/lib/auth");
    const result = await auth.api.userHasPermission({ body: { userId: currentUser.id, permissions: { purchasing: [...permissions] } } });
    return result.success;
  }).pipe(Effect.orElseSucceed(() => false));
};
export const hasPurchasingPermission = (context: Pick<ActionAPIContext, "locals">, permissions: readonly PurchasingPermission[]): Promise<boolean> =>
  Effect.runPromise(hasPurchasingPermissionEffect(context, permissions));
