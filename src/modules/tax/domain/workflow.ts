/**
 * Workflow éditorial du domaine tax (core/workflow) : états et transitions
 * autorisées. Le service refuse toute transition absente de cette table.
 */
import type { WorkflowDefinition } from "@/core/workflow";

export const TAX_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type TaxStatus = (typeof TAX_STATUSES)[number];

export const taxWorkflow: WorkflowDefinition<TaxStatus> = {
  states: TAX_STATUSES,
  transitions: [
    { from: "DRAFT", to: "PUBLISHED" },
    { from: "PUBLISHED", to: "DRAFT" },
    { from: "DRAFT", to: "ARCHIVED" },
    { from: "PUBLISHED", to: "ARCHIVED" },
    { from: "ARCHIVED", to: "DRAFT" },
  ],
};
