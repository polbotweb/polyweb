/**
 * Pipeline commercial du domaine crm (core/workflow) :
 *
 *   NEW → QUALIFIED → PROPOSAL → NEGOTIATION → WON | LOST
 *
 * On peut revenir d'une étape ouverte à la précédente, perdre une opportunité à toute étape
 * ouverte, et rouvrir une opportunité perdue (LOST → QUALIFIED). Une opportunité gagnée est
 * close : elle ne se rouvre pas (le devis / la facture vivent dans le module ventes).
 * Le service refuse toute transition absente de cette table.
 */
import type { WorkflowDefinition } from "@/core/workflow";

export const CRM_STAGES = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
export type CrmStage = (typeof CRM_STAGES)[number];
/** Alias attendu par le socle généré (statut = étape du pipeline). */
export const CRM_STATUSES = CRM_STAGES;
export type CrmStatus = CrmStage;

export const OPEN_STAGES: readonly CrmStage[] = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION"];
export const CLOSED_STAGES: readonly CrmStage[] = ["WON", "LOST"];

export const crmWorkflow: WorkflowDefinition<CrmStage> = {
  states: CRM_STAGES,
  transitions: [
    { from: "NEW", to: "QUALIFIED" },
    { from: "QUALIFIED", to: "PROPOSAL" },
    { from: "PROPOSAL", to: "NEGOTIATION" },
    { from: "QUALIFIED", to: "NEW" },
    { from: "PROPOSAL", to: "QUALIFIED" },
    { from: "NEGOTIATION", to: "PROPOSAL" },
    { from: "PROPOSAL", to: "WON" },
    { from: "NEGOTIATION", to: "WON" },
    { from: "NEW", to: "LOST" },
    { from: "QUALIFIED", to: "LOST" },
    { from: "PROPOSAL", to: "LOST" },
    { from: "NEGOTIATION", to: "LOST" },
    { from: "LOST", to: "QUALIFIED" },
  ],
};

export const isOpenStage = (stage: CrmStage) => OPEN_STAGES.includes(stage);

/** Étapes proposées depuis `from`, dans l'ordre du pipeline. */
export const nextStages = (from: CrmStage): readonly CrmStage[] =>
  CRM_STAGES.filter((to) => crmWorkflow.transitions.some((t) => t.from === from && t.to === to));

/** Probabilité de gain par défaut (%) selon l'étape, surchargeable par opportunité. */
export const DEFAULT_STAGE_PROBABILITY: Readonly<Record<CrmStage, number>> = {
  NEW: 10,
  QUALIFIED: 25,
  PROPOSAL: 50,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0,
};

/** Raisons de perte (clés i18n). */
export const LOST_REASONS = ["price", "competitor", "timing", "no_budget", "no_decision", "other"] as const;
export type LostReason = (typeof LOST_REASONS)[number];
