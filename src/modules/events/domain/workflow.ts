/**
 * Workflow éditorial du domaine events (core/workflow) : états et transitions
 * autorisées. Le service refuse toute transition absente de cette table.
 */
import type { WorkflowDefinition } from "@/core/workflow";

export const EVENTS_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type EventsStatus = (typeof EVENTS_STATUSES)[number];

export const eventsWorkflow: WorkflowDefinition<EventsStatus> = {
  states: EVENTS_STATUSES,
  transitions: [
    { from: "DRAFT", to: "PUBLISHED" },
    { from: "PUBLISHED", to: "DRAFT" },
    { from: "DRAFT", to: "ARCHIVED" },
    { from: "PUBLISHED", to: "ARCHIVED" },
    { from: "ARCHIVED", to: "DRAFT" },
  ],
};
