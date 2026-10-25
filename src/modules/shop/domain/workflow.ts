/**
 * Workflow éditorial du domaine shop (core/workflow) : états et transitions
 * autorisées. Le service refuse toute transition absente de cette table.
 */
import type { WorkflowDefinition } from "@/core/workflow";

export const SHOP_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type ShopStatus = (typeof SHOP_STATUSES)[number];

export const shopWorkflow: WorkflowDefinition<ShopStatus> = {
  states: SHOP_STATUSES,
  transitions: [
    { from: "DRAFT", to: "PUBLISHED" },
    { from: "PUBLISHED", to: "DRAFT" },
    { from: "DRAFT", to: "ARCHIVED" },
    { from: "PUBLISHED", to: "ARCHIVED" },
    { from: "ARCHIVED", to: "DRAFT" },
  ],
};
