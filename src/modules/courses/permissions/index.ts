/**
 * Garde de permission Effect du domaine courses (RBAC better-auth). Le namespace
 * « courses » doit être déclaré dans le contrôle d'accès (`src/lib/permissions`).
 */
import type { ActionAPIContext } from "astro:actions";
import { requireActionPermission } from "@/lib/effect/action";

export type CoursesPermission = "create" | "read" | "update" | "publish" | "delete";

export const requireCoursesPermission = (context: ActionAPIContext, permissions: readonly CoursesPermission[]) =>
  requireActionPermission(context, { "courses": [...permissions] });
