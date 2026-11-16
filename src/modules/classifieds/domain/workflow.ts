/**
 * Cycle de vie d'une annonce (axe métier) et transitions autorisées.
 * La visibilité de modération (`visible` / `hidden` / `spam`) est un axe distinct.
 */
import type { WorkflowDefinition } from "@/core/workflow";

export const CLASSIFIED_LIFECYCLES = ["draft", "pending", "published", "expired", "sold", "archived"] as const;
export type ClassifiedLifecycle = (typeof CLASSIFIED_LIFECYCLES)[number];

export const CLASSIFIED_VISIBILITIES = ["public", "members", "org"] as const;
export type ClassifiedVisibility = (typeof CLASSIFIED_VISIBILITIES)[number];

export const CLASSIFIED_KINDS = ["offer", "wanted"] as const;
export type ClassifiedKind = (typeof CLASSIFIED_KINDS)[number];

export const CLASSIFIED_CONDITIONS = ["new", "used", "n_a"] as const;
export type ClassifiedCondition = (typeof CLASSIFIED_CONDITIONS)[number];

export const CLASSIFIED_PRICE_KINDS = ["fixed", "free", "on_request"] as const;
export type ClassifiedPriceKind = (typeof CLASSIFIED_PRICE_KINDS)[number];

export const MODERATION_STATUSES = ["visible", "hidden", "spam"] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const classifiedsWorkflow: WorkflowDefinition<ClassifiedLifecycle> = {
  states: CLASSIFIED_LIFECYCLES,
  transitions: [
    { from: "draft", to: "pending" },
    { from: "draft", to: "published" },
    { from: "draft", to: "archived" },
    { from: "pending", to: "published" },
    { from: "pending", to: "draft" },
    { from: "pending", to: "archived" },
    { from: "published", to: "expired" },
    { from: "published", to: "sold" },
    { from: "published", to: "archived" },
    { from: "expired", to: "published" },
    { from: "expired", to: "archived" },
    { from: "sold", to: "archived" },
    { from: "archived", to: "draft" },
  ],
};

export const canTransition = (from: ClassifiedLifecycle, to: ClassifiedLifecycle) =>
  classifiedsWorkflow.transitions.some((t) => t.from === from && t.to === to);
