/**
 * Workflow éditorial du domaine subscriptions (core/workflow) : états et transitions
 * autorisées. Le service refuse toute transition absente de cette table.
 */
import type { WorkflowDefinition } from "@/core/workflow";

export const SUBSCRIPTIONS_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type SubscriptionsStatus = (typeof SUBSCRIPTIONS_STATUSES)[number];

export const subscriptionsWorkflow: WorkflowDefinition<SubscriptionsStatus> = {
  states: SUBSCRIPTIONS_STATUSES,
  transitions: [
    { from: "DRAFT", to: "PUBLISHED" },
    { from: "PUBLISHED", to: "DRAFT" },
    { from: "DRAFT", to: "ARCHIVED" },
    { from: "PUBLISHED", to: "ARCHIVED" },
    { from: "ARCHIVED", to: "DRAFT" },
  ],
};
