/**
 * Gardes de permission Effect du domaine formations, tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → le contenu
 * de SA organisation uniquement ; contenu plateforme (`organizationId = null`) → RBAC global.
 * Le namespace « formations » doit être déclaré dans le contrôle d'accès (`src/lib/permissions`).
 */
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { formations } from "../schema";

export type FormationsPermission = "create" | "read" | "update" | "publish" | "delete";

/** Contenu de l'organisation `organizationId` (`null` = plateforme) : création, actions groupées. */
export const requireFormationsPermission = (context: ActionAPIContext, permissions: readonly FormationsPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { "formations": [...permissions] }, organizationId);

/** Élément existant : son organisation est lue en base (introuvable → NOT_FOUND) avant la garde tenant. */
export const requireFormationsResourcePermission = (context: ActionAPIContext, permissions: readonly FormationsPermission[], id: string) =>
  requireTenantResourcePermission(context, { "formations": [...permissions] }, () =>
    getDrizzle().select({ organizationId: formations.organizationId }).from(formations).where(eq(formations.id, id)).limit(1),
  );
