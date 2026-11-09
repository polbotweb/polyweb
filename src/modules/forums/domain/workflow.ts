/**
 * Workflow éditorial du domaine forums (core/workflow) : états et transitions
 * autorisées. Le service refuse toute transition absente de cette table.
 */
import type { WorkflowDefinition } from "@/core/workflow";

export const FORUMS_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type ForumsStatus = (typeof FORUMS_STATUSES)[number];

export const forumsWorkflow: WorkflowDefinition<ForumsStatus> = {
  states: FORUMS_STATUSES,
  transitions: [
    { from: "DRAFT", to: "PUBLISHED" },
    { from: "PUBLISHED", to: "DRAFT" },
    { from: "DRAFT", to: "ARCHIVED" },
    { from: "PUBLISHED", to: "ARCHIVED" },
    { from: "ARCHIVED", to: "DRAFT" },
  ],
};
