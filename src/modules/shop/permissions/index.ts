/**
 * Gardes de permission Effect du domaine shop, tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → le contenu
 * de SA organisation uniquement ; contenu plateforme (`organizationId = null`) → RBAC global.
 * Le namespace « shop » doit être déclaré dans le contrôle d'accès (`src/lib/permissions`).
 */
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { shop } from "../schema";

export type ShopPermission = "create" | "read" | "update" | "publish" | "delete";

/** Contenu de l'organisation `organizationId` (`null` = plateforme) : création, actions groupées. */
export const requireShopPermission = (context: ActionAPIContext, permissions: readonly ShopPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { "shop": [...permissions] }, organizationId);

/** Élément existant : son organisation est lue en base (introuvable → NOT_FOUND) avant la garde tenant. */
export const requireShopResourcePermission = (context: ActionAPIContext, permissions: readonly ShopPermission[], id: string) =>
  requireTenantResourcePermission(context, { "shop": [...permissions] }, () =>
    getDrizzle().select({ organizationId: shop.organizationId }).from(shop).where(eq(shop.id, id)).limit(1),
  );
