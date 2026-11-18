/**
 * Gardes de permission Effect du domaine banking, tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → le contenu
 * de SA organisation uniquement ; contenu plateforme (`organizationId = null`) → RBAC global.
 * Namespace « banking » déclaré dans `./statements.ts` (registre core `permissions/registry`).
 */
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { banking } from "../schema";

export type BankingPermission = "create" | "read" | "update" | "publish" | "delete";

/** Contenu de l'organisation `organizationId` (`null` = plateforme) : création, actions groupées. */
export const requireBankingPermission = (context: ActionAPIContext, permissions: readonly BankingPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { "banking": [...permissions] }, organizationId);

/** Élément existant : son organisation est lue en base (introuvable → NOT_FOUND) avant la garde tenant. */
export const requireBankingResourcePermission = (context: ActionAPIContext, permissions: readonly BankingPermission[], id: string) =>
  requireTenantResourcePermission(context, { "banking": [...permissions] }, () =>
    getDrizzle().select({ organizationId: banking.organizationId }).from(banking).where(eq(banking.id, id)).limit(1),
  );
