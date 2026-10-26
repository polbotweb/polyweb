/**
 * Gardes de permission Effect du domaine sales, tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → le contenu
 * de SA organisation uniquement ; contenu plateforme (`organizationId = null`) → RBAC global.
 * Le namespace « sales » doit être déclaré dans le contrôle d'accès (`src/lib/permissions`).
 */
import type { ActionAPIContext } from "astro:actions";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { sales } from "../schema";

/** `issue` : émettre (numéroter) factures et avoirs ; `payment` : encaissements et relances. */
export const SALES_PERMISSIONS = ["create", "read", "update", "delete", "issue", "payment"] as const;
export type SalesPermission = (typeof SALES_PERMISSIONS)[number];

/** Contenu de l'organisation `organizationId` (`null` = plateforme) : création, actions groupées. */
export const requireSalesPermission = (context: ActionAPIContext, permissions: readonly SalesPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { "sales": [...permissions] }, organizationId);

/** Élément existant : son organisation est lue en base (introuvable → NOT_FOUND) avant la garde tenant. */
export const requireSalesResourcePermission = (context: ActionAPIContext, permissions: readonly SalesPermission[], id: string) =>
  requireTenantResourcePermission(context, { "sales": [...permissions] }, () =>
    getDrizzle().select({ organizationId: sales.organizationId }).from(sales).where(eq(sales.id, id)).limit(1),
  );

/** Page back-office plateforme : RBAC global (`userHasPermission`) ; toute erreur → refus. */
export const hasSalesPermissionEffect = (context: Pick<ActionAPIContext, "locals">, permissions: readonly SalesPermission[]): Effect.Effect<boolean> => {
  const currentUser = context.locals.user;
  if (!currentUser || currentUser.banned) return Effect.succeed(false);
  return Effect.tryPromise(async () => {
    const { auth } = await import("@/lib/auth");
    const result = await auth.api.userHasPermission({ body: { userId: currentUser.id, permissions: { sales: [...permissions] } } });
    return result.success;
  }).pipe(Effect.orElseSucceed(() => false));
};
export const hasSalesPermission = (context: Pick<ActionAPIContext, "locals">, permissions: readonly SalesPermission[]): Promise<boolean> =>
  Effect.runPromise(hasSalesPermissionEffect(context, permissions));
