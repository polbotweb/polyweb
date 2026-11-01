/**
 * Gardes de permission Effect du domaine subscriptions, tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → le contenu
 * de SA organisation uniquement ; contenu plateforme (`organizationId = null`) → RBAC global.
 * Le namespace « subscriptions » doit être déclaré dans le contrôle d'accès (`src/lib/permissions`).
 */
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { subscriptions } from "../schema";

export type SubscriptionsPermission = "create" | "read" | "update" | "publish" | "delete";

/** Contenu de l'organisation `organizationId` (`null` = plateforme) : création, actions groupées. */
export const requireSubscriptionsPermission = (context: ActionAPIContext, permissions: readonly SubscriptionsPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { "subscriptions": [...permissions] }, organizationId);

/** Élément existant : son organisation est lue en base (introuvable → NOT_FOUND) avant la garde tenant. */
export const requireSubscriptionsResourcePermission = (context: ActionAPIContext, permissions: readonly SubscriptionsPermission[], id: string) =>
  requireTenantResourcePermission(context, { "subscriptions": [...permissions] }, () =>
    getDrizzle().select({ organizationId: subscriptions.organizationId }).from(subscriptions).where(eq(subscriptions.id, id)).limit(1),
  );
