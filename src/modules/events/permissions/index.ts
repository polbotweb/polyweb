/**
 * Gardes de permission Effect du domaine events, tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → le contenu
 * de SA organisation uniquement ; contenu plateforme (`organizationId = null`) → RBAC global.
 * Le namespace « events » doit être déclaré dans le contrôle d'accès (`src/lib/permissions`).
 */
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { events } from "../schema";

export type EventsPermission = "create" | "read" | "update" | "publish" | "delete";

/** Contenu de l'organisation `organizationId` (`null` = plateforme) : création, actions groupées. */
export const requireEventsPermission = (context: ActionAPIContext, permissions: readonly EventsPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { "events": [...permissions] }, organizationId);

/** Élément existant : son organisation est lue en base (introuvable → NOT_FOUND) avant la garde tenant. */
export const requireEventsResourcePermission = (context: ActionAPIContext, permissions: readonly EventsPermission[], id: string) =>
  requireTenantResourcePermission(context, { "events": [...permissions] }, () =>
    getDrizzle().select({ organizationId: events.organizationId }).from(events).where(eq(events.id, id)).limit(1),
  );
