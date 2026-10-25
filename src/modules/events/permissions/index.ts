/**
 * Garde de permission Effect du domaine events (RBAC better-auth). Le namespace
 * « events » doit être déclaré dans le contrôle d'accès (`src/lib/permissions`).
 */
import type { ActionAPIContext } from "astro:actions";
import { requireActionPermission } from "@/lib/effect/action";

export type EventsPermission = "create" | "read" | "update" | "publish" | "delete";

export const requireEventsPermission = (context: ActionAPIContext, permissions: readonly EventsPermission[]) =>
  requireActionPermission(context, { "events": [...permissions] });
