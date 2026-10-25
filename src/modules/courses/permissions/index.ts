/**
 * Gardes de permission Effect du domaine courses, tenant-aware (core `permissions/tenant`) :
 * administrateur global → tout ; propriétaire / administrateur d'organisation → le contenu
 * de SA organisation uniquement ; contenu plateforme (`organizationId = null`) → RBAC global.
 * Le namespace « courses » doit être déclaré dans le contrôle d'accès (`src/lib/permissions`).
 */
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { courses } from "../schema";

export type CoursesPermission = "create" | "read" | "update" | "publish" | "delete";

/** Contenu de l'organisation `organizationId` (`null` = plateforme) : création, actions groupées. */
export const requireCoursesPermission = (context: ActionAPIContext, permissions: readonly CoursesPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { "courses": [...permissions] }, organizationId);

/** Élément existant : son organisation est lue en base (introuvable → NOT_FOUND) avant la garde tenant. */
export const requireCoursesResourcePermission = (context: ActionAPIContext, permissions: readonly CoursesPermission[], id: string) =>
  requireTenantResourcePermission(context, { "courses": [...permissions] }, () =>
    getDrizzle().select({ organizationId: courses.organizationId }).from(courses).where(eq(courses.id, id)).limit(1),
  );
