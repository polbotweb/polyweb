/**
 * Gardes de permission Effect du domaine tax, tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → le contenu
 * de SA organisation uniquement ; contenu plateforme (`organizationId = null`) → RBAC global.
 * Le namespace « tax » doit être déclaré dans le contrôle d'accès (`src/lib/permissions`).
 */
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { tax } from "../schema";

export type TaxPermission = "create" | "read" | "update" | "publish" | "delete";

/** Contenu de l'organisation `organizationId` (`null` = plateforme) : création, actions groupées. */
export const requireTaxPermission = (context: ActionAPIContext, permissions: readonly TaxPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { "tax": [...permissions] }, organizationId);

/** Élément existant : son organisation est lue en base (introuvable → NOT_FOUND) avant la garde tenant. */
export const requireTaxResourcePermission = (context: ActionAPIContext, permissions: readonly TaxPermission[], id: string) =>
  requireTenantResourcePermission(context, { "tax": [...permissions] }, () =>
    getDrizzle().select({ organizationId: tax.organizationId }).from(tax).where(eq(tax.id, id)).limit(1),
  );
