/**
 * Gardes de permission Effect du domaine classifieds, tenant-aware (core `permissions/tenant`).
 * Namespace « classifieds » déclaré dans `./statements.ts`.
 */
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import { classifiedAds } from "../schema";

export type ClassifiedsPermission = "create" | "read" | "update" | "delete" | "moderate" | "configure";

export const requireClassifiedsPermission = (context: ActionAPIContext, permissions: readonly ClassifiedsPermission[], organizationId: string | null) =>
  requireTenantPermission(context, { classifieds: [...permissions] }, organizationId);

export const requireClassifiedsResourcePermission = (context: ActionAPIContext, permissions: readonly ClassifiedsPermission[], id: string) =>
  requireTenantResourcePermission(context, { classifieds: [...permissions] }, () =>
    getDrizzle().select({ organizationId: classifiedAds.organizationId }).from(classifiedAds).where(eq(classifiedAds.id, id)).limit(1),
  );
