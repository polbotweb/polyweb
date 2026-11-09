/**
 * Gardes de permission Effect du domaine forums, tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → le contenu
 * de SA organisation uniquement ; contenu plateforme (`organizationId = null`) → RBAC global.
 * Namespace « forums » déclaré dans `./statements.ts` (registre core `permissions/registry`).
 */
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { forums } from "../schema";

export type ForumsPermission = "create" | "read" | "update" | "publish" | "delete";

/** Contenu de l'organisation `organizationId` (`null` = plateforme) : création, actions groupées. */
export const requireForumsPermission = (context: ActionAPIContext, permissions: readonly ForumsPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { "forums": [...permissions] }, organizationId);

/** Élément existant : son organisation est lue en base (introuvable → NOT_FOUND) avant la garde tenant. */
export const requireForumsResourcePermission = (context: ActionAPIContext, permissions: readonly ForumsPermission[], id: string) =>
  requireTenantResourcePermission(context, { "forums": [...permissions] }, () =>
    getDrizzle().select({ organizationId: forums.organizationId }).from(forums).where(eq(forums.id, id)).limit(1),
  );
