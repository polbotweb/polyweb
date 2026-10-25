/**
 * Garde de permission Effect du domaine formations (RBAC better-auth). Le namespace
 * « formations » doit être déclaré dans le contrôle d'accès (`src/lib/permissions`).
 */
import type { ActionAPIContext } from "astro:actions";
import { requireActionPermission } from "@/lib/effect/action";

export type FormationsPermission = "create" | "read" | "update" | "publish" | "delete";

export const requireFormationsPermission = (context: ActionAPIContext, permissions: readonly FormationsPermission[]) =>
  requireActionPermission(context, { "formations": [...permissions] });
