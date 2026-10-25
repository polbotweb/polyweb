/**
 * Workflow éditorial du domaine formations (core/workflow) : états et transitions
 * autorisées. Le service refuse toute transition absente de cette table.
 */
import type { WorkflowDefinition } from "@/core/workflow";

export const FORMATIONS_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type FormationsStatus = (typeof FORMATIONS_STATUSES)[number];

export const formationsWorkflow: WorkflowDefinition<FormationsStatus> = {
  states: FORMATIONS_STATUSES,
  transitions: [
    { from: "DRAFT", to: "PUBLISHED" },
    { from: "PUBLISHED", to: "DRAFT" },
    { from: "DRAFT", to: "ARCHIVED" },
    { from: "PUBLISHED", to: "ARCHIVED" },
    { from: "ARCHIVED", to: "DRAFT" },
  ],
};
