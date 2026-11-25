/**
 * Gardes de permission Effect des modules banking et accounting, tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → les données de SA
 * organisation uniquement ; données plateforme (`organizationId = null`) → RBAC global.
 * Namespaces « banking » et « accounting » déclarés dans `./statements.ts`.
 */
import type { ActionAPIContext } from "astro:actions";
import { Effect } from "effect";
import { requireTenantPermission } from "@/lib/effect/action";
import type { ACCOUNTING_ACTIONS, BANKING_ACTIONS } from "./statements";

export type BankingPermission = (typeof BANKING_ACTIONS)[number];
export type AccountingPermission = (typeof ACCOUNTING_ACTIONS)[number];

/** Données banking de l'organisation `organizationId` (`null` = plateforme). */
export const requireBankingPermission = (context: ActionAPIContext, permissions: readonly BankingPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { banking: [...permissions] }, organizationId);

export const requireAccountingPermission = (context: ActionAPIContext, permissions: readonly AccountingPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { accounting: [...permissions] }, organizationId);

/** Page back-office : RBAC global (`userHasPermission`) ; toute erreur → refus. */
export const hasBankingPermissionEffect = (context: Pick<ActionAPIContext, "locals">, permissions: { readonly banking?: readonly BankingPermission[]; readonly accounting?: readonly AccountingPermission[] }): Effect.Effect<boolean> => {
  const currentUser = context.locals.user;
  if (!currentUser || currentUser.banned) return Effect.succeed(false);
  return Effect.tryPromise(async () => {
    const { auth } = await import("@/lib/auth");
    const body = { userId: currentUser.id, permissions: Object.fromEntries(Object.entries(permissions).map(([key, value]) => [key, [...(value ?? [])]])) };
    const result = await auth.api.userHasPermission({ body });
    return result.success;
  }).pipe(Effect.orElseSucceed(() => false));
};
export const hasBankingPermission = (context: Pick<ActionAPIContext, "locals">, permissions: Parameters<typeof hasBankingPermissionEffect>[1]): Promise<boolean> =>
  Effect.runPromise(hasBankingPermissionEffect(context, permissions));
