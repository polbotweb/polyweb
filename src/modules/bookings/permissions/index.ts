/**
 * Gardes de permission Effect du domaine bookings (réservations), tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → les données
 * de SA organisation uniquement ; données plateforme (`organizationId = null`) → RBAC global.
 * Namespace « bookings » déclaré dans `src/lib/permissions`.
 */
import type { ActionAPIContext } from "astro:actions";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { bookings, bookingsResources } from "../schema";

export const BOOKINGS_PERMISSIONS = ["create", "read", "update", "delete"] as const;
export type BookingsPermission = (typeof BOOKINGS_PERMISSIONS)[number];

/** Ressources du module dont l'organisation se lit en base. */
export const BOOKINGS_RESOURCES = { booking: bookings, resource: bookingsResources } as const;
export type BookingsResource = keyof typeof BOOKINGS_RESOURCES;

/** Données de l'organisation `organizationId` (`null` = plateforme) : création, actions groupées. */
export const requireBookingsPermission = (context: ActionAPIContext, permissions: readonly BookingsPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { bookings: [...permissions] }, organizationId);

/** Élément existant : son organisation est lue en base (introuvable → NOT_FOUND) avant la garde tenant. */
export const requireBookingsResourcePermission = (context: ActionAPIContext, permissions: readonly BookingsPermission[], id: string, resource: BookingsResource = "booking") => {
  const table = BOOKINGS_RESOURCES[resource];
  return requireTenantResourcePermission(context, { bookings: [...permissions] }, () =>
    getDrizzle().select({ organizationId: table.organizationId }).from(table).where(eq(table.id, id)).limit(1),
  );
};

/** Page back-office : RBAC global (`userHasPermission`) ; toute erreur → refus. */
export const hasBookingsPermissionEffect = (context: Pick<ActionAPIContext, "locals">, permissions: readonly BookingsPermission[]): Effect.Effect<boolean> => {
  const currentUser = context.locals.user;
  if (!currentUser || currentUser.banned) return Effect.succeed(false);
  return Effect.tryPromise(async () => {
    const { auth } = await import("@/lib/auth");
    const result = await auth.api.userHasPermission({ body: { userId: currentUser.id, permissions: { bookings: [...permissions] } } });
    return result.success;
  }).pipe(Effect.orElseSucceed(() => false));
};
export const hasBookingsPermission = (context: Pick<ActionAPIContext, "locals">, permissions: readonly BookingsPermission[]): Promise<boolean> =>
  Effect.runPromise(hasBookingsPermissionEffect(context, permissions));
