/**
 * Workflow éditorial du domaine banking (core/workflow) : états et transitions
 * autorisées. Le service refuse toute transition absente de cette table.
 */
import type { WorkflowDefinition } from "@/core/workflow";

export const BANKING_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type BankingStatus = (typeof BANKING_STATUSES)[number];

export const bankingWorkflow: WorkflowDefinition<BankingStatus> = {
  states: BANKING_STATUSES,
  transitions: [
    { from: "DRAFT", to: "PUBLISHED" },
    { from: "PUBLISHED", to: "DRAFT" },
    { from: "DRAFT", to: "ARCHIVED" },
    { from: "PUBLISHED", to: "ARCHIVED" },
    { from: "ARCHIVED", to: "DRAFT" },
  ],
};
