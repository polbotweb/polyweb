/**
 * Gardes de permission Effect du domaine logistics, tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → les données
 * de SA organisation uniquement ; données plateforme (`organizationId = null`) → RBAC global.
 * Namespace « logistics » déclaré dans `src/lib/permissions`.
 */
import type { ActionAPIContext } from "astro:actions";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { actionTry, requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { fail } from "@/lib/effect/failure";
import { logistics, logisticsInventoryCounts, logisticsItems, logisticsStockMovements, logisticsWarehouses } from "../schema";

export const LOGISTICS_PERMISSIONS = ["create", "read", "update", "delete"] as const;
export type LogisticsPermission = (typeof LOGISTICS_PERMISSIONS)[number];

/** Ressources du module dont l'organisation se lit en base. */
export const LOGISTICS_RESOURCES = { shipment: logistics, warehouse: logisticsWarehouses, item: logisticsItems, movement: logisticsStockMovements, inventory: logisticsInventoryCounts } as const;
export type LogisticsResource = keyof typeof LOGISTICS_RESOURCES;

/** Données de l'organisation `organizationId` (`null` = plateforme) : création, actions groupées. */
export const requireLogisticsPermission = (context: ActionAPIContext, permissions: readonly LogisticsPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { logistics: [...permissions] }, organizationId);

/** Élément existant : son organisation est lue en base (introuvable → NOT_FOUND) avant la garde tenant. */
export const requireLogisticsResourcePermission = (context: ActionAPIContext, permissions: readonly LogisticsPermission[], id: string, resource: LogisticsResource = "shipment") => {
  const table = LOGISTICS_RESOURCES[resource];
  return requireTenantResourcePermission(context, { logistics: [...permissions] }, () =>
    getDrizzle().select({ organizationId: table.organizationId }).from(table).where(eq(table.id, id)).limit(1),
  );
};

/** Inventaire existant : garde tenant sur SON organisation, renvoyée pour borner le service. */
export const requireInventoryPermission = (context: ActionAPIContext, permissions: readonly LogisticsPermission[], id: string) =>
  Effect.gen(function* () {
    if (!context.locals.user) return yield* fail("UNAUTHORIZED", "Vous devez être connecté pour effectuer cette action.");
    const [row] = yield* actionTry("logistics.inventory.organization", () =>
      getDrizzle().select({ organizationId: logisticsInventoryCounts.organizationId }).from(logisticsInventoryCounts).where(eq(logisticsInventoryCounts.id, id)).limit(1));
    if (!row) return yield* fail("NOT_FOUND", "Inventaire introuvable.");
    const user = yield* requireTenantPermission(context, { logistics: [...permissions] }, row.organizationId ?? null);
    return { user, organizationId: row.organizationId ?? null };
  });

/** Page back-office : RBAC global (`userHasPermission`) ; toute erreur → refus. */
export const hasLogisticsPermissionEffect = (context: Pick<ActionAPIContext, "locals">, permissions: readonly LogisticsPermission[]): Effect.Effect<boolean> => {
  const currentUser = context.locals.user;
  if (!currentUser || currentUser.banned) return Effect.succeed(false);
  return Effect.tryPromise(async () => {
    const { auth } = await import("@/lib/auth");
    const result = await auth.api.userHasPermission({ body: { userId: currentUser.id, permissions: { logistics: [...permissions] } } });
    return result.success;
  }).pipe(Effect.orElseSucceed(() => false));
};
export const hasLogisticsPermission = (context: Pick<ActionAPIContext, "locals">, permissions: readonly LogisticsPermission[]): Promise<boolean> =>
  Effect.runPromise(hasLogisticsPermissionEffect(context, permissions));
