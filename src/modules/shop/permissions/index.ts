/**
 * Garde de permission Effect du domaine shop (RBAC better-auth). Le namespace
 * « shop » doit être déclaré dans le contrôle d'accès (`src/lib/permissions`).
 */
import type { ActionAPIContext } from "astro:actions";
import { requireActionPermission } from "@/lib/effect/action";

export type ShopPermission = "create" | "read" | "update" | "publish" | "delete";

export const requireShopPermission = (context: ActionAPIContext, permissions: readonly ShopPermission[]) =>
  requireActionPermission(context, { "shop": [...permissions] });
