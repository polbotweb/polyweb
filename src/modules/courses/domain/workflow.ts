/**
 * Workflow éditorial du domaine courses (core/workflow) : états et transitions
 * autorisées. Le service refuse toute transition absente de cette table.
 */
import type { WorkflowDefinition } from "@/core/workflow";

export const COURSES_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type CoursesStatus = (typeof COURSES_STATUSES)[number];

export const coursesWorkflow: WorkflowDefinition<CoursesStatus> = {
  states: COURSES_STATUSES,
  transitions: [
    { from: "DRAFT", to: "PUBLISHED" },
    { from: "PUBLISHED", to: "DRAFT" },
    { from: "DRAFT", to: "ARCHIVED" },
    { from: "PUBLISHED", to: "ARCHIVED" },
    { from: "ARCHIVED", to: "DRAFT" },
  ],
};
