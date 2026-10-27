/**
 * Gardes de permission Effect du domaine shop, tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → le contenu
 * de SA organisation uniquement ; contenu plateforme (`organizationId = null`) → RBAC global.
 * Le namespace « shop » doit être déclaré dans le contrôle d'accès (`src/lib/permissions`).
 */
import type { ActionAPIContext } from "astro:actions";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { products } from "../schema";

export type ShopPermission = "create" | "read" | "update" | "publish" | "delete";

/** Contenu de l'organisation `organizationId` (`null` = plateforme) : création, actions groupées. */
export const requireShopPermission = (context: ActionAPIContext, permissions: readonly ShopPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { "shop": [...permissions] }, organizationId);

/** Élément existant : son organisation est lue en base (introuvable → NOT_FOUND) avant la garde tenant. */
export const requireShopResourcePermission = (context: ActionAPIContext, permissions: readonly ShopPermission[], id: string) =>
  requireTenantResourcePermission(context, { "shop": [...permissions] }, () =>
    getDrizzle().select({ organizationId: products.organizationId }).from(products).where(eq(products.id, id)).limit(1),
  );

/**
 * Garde des pages d'administration des commandes (SSR, formulaires classiques) : RBAC global
 * « shop » (les commandes publiques appartiennent au tenant plateforme). Lecture : `read` ;
 * transitions et liens : `update`. Utilisateur absent ou banni → refus.
 */
export const hasShopPermissionEffect = (context: Pick<ActionAPIContext, "locals">, permissions: readonly ShopPermission[]): Effect.Effect<boolean> => {
  const currentUser = context.locals.user;
  if (!currentUser || currentUser.banned) return Effect.succeed(false);
  return Effect.tryPromise(async () => {
    const { auth } = await import("@/lib/auth");
    const result = await auth.api.userHasPermission({ body: { userId: currentUser.id, permissions: { shop: [...permissions] } } });
    return result.success;
  }).pipe(Effect.orElseSucceed(() => false));
};
export const hasShopPermission = (context: Pick<ActionAPIContext, "locals">, permissions: readonly ShopPermission[]): Promise<boolean> =>
  Effect.runPromise(hasShopPermissionEffect(context, permissions));
