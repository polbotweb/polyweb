/**
 * Retours clients (RMA) d'une commande livrée : cycle de vie (core/workflow), motifs,
 * quantités retournables et montant remboursé. Fonctions pures, testées unitairement.
 *
 * REQUESTED → APPROVED → RECEIVED → INSPECTED → REFUNDED
 *           ↘ REJECTED   (avant réception)     ↘ CLOSED (rien d'accepté : aucun remboursement)
 * Une demande non encore reçue peut être annulée (CANCELLED). À l'inspection, les quantités
 * acceptées sont remboursées (prix TTC unitaire figé sur la ligne, port exclu) et les quantités
 * revendables rentrent en stock (Logistics, mouvement `return`).
 */
import type { WorkflowDefinition } from "@/core/workflow";
import type { NumberingScheme } from "@/core/numbering";

export const RETURN_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "RECEIVED", "INSPECTED", "REFUNDED", "CLOSED", "CANCELLED"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export const isReturnStatus = (value: string): value is ReturnStatus => (RETURN_STATUSES as readonly string[]).includes(value);

export const returnWorkflow: WorkflowDefinition<ReturnStatus> = {
  states: RETURN_STATUSES,
  transitions: [
    { from: "REQUESTED", to: "APPROVED" },
    { from: "REQUESTED", to: "REJECTED" },
    { from: "REQUESTED", to: "CANCELLED" },
    { from: "APPROVED", to: "RECEIVED" },
    { from: "APPROVED", to: "CANCELLED" },
    { from: "RECEIVED", to: "INSPECTED" },
    { from: "RECEIVED", to: "CLOSED" },
    { from: "INSPECTED", to: "REFUNDED" },
  ],
};

/** Statuts qui « consomment » les quantités d'une ligne de commande (pas de double retour). */
export const OPEN_RETURN_STATUSES: readonly ReturnStatus[] = ["REQUESTED", "APPROVED", "RECEIVED", "INSPECTED", "REFUNDED"];

export const RETURN_REASONS = ["defective", "damaged", "wrong_item", "not_as_described", "no_longer_needed", "other"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
export const isReturnReason = (value: string): value is ReturnReason => (RETURN_REASONS as readonly string[]).includes(value);

export const RETURN_CONDITIONS = ["resellable", "damaged"] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

export const RETURN_NUMBERING_KEY = "shop.return";
/** Sans trou, remise annuelle, attribué à la création de la demande (dans sa transaction). */
export const DEFAULT_RETURN_NUMBERING: NumberingScheme = { pattern: "{prefix}-{YYYY}-{seq:5}", reset: "yearly", prefix: "RMA" };

/** Lignes et notes bornées : une demande reste lisible et auditable. */
export const RETURN_MAX_LINES = 50;
export const RETURN_NOTE_MAX = 1000;

export interface ReturnableLine {
  readonly id: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
}

/**
 * Quantité encore retournable par ligne : commandée − déjà demandée dans un retour ouvert.
 * Les retours refusés, annulés ou clos sans acceptation libèrent leurs quantités, sauf la
 * part acceptée d'un retour clos (aucune ici : clos = rien d'accepté).
 */
export const returnableQuantities = (
  lines: readonly ReturnableLine[],
  taken: readonly { readonly orderLineId: string; readonly quantity: number }[],
): ReadonlyMap<string, number> => {
  const used = new Map<string, number>();
  for (const row of taken) used.set(row.orderLineId, (used.get(row.orderLineId) ?? 0) + row.quantity);
  return new Map(lines.map((line) => [line.id, Math.max(0, line.quantity - (used.get(line.id) ?? 0))]));
};

export type ReturnRequestProblem = "empty" | "tooMany" | "unknownLine" | "quantity" | "duplicate";

/** Contrôle d'une demande : lignes connues, distinctes, quantités entières dans le retournable. */
export const checkReturnRequest = (
  requested: readonly { readonly orderLineId: string; readonly quantity: number }[],
  returnable: ReadonlyMap<string, number>,
): ReturnRequestProblem | null => {
  const lines = requested.filter((line) => line.quantity !== 0);
  if (lines.length === 0) return "empty";
  if (lines.length > RETURN_MAX_LINES) return "tooMany";
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.orderLineId)) return "duplicate";
    seen.add(line.orderLineId);
    const max = returnable.get(line.orderLineId);
    if (max === undefined) return "unknownLine";
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > max) return "quantity";
  }
  return null;
};

export interface InspectedLine {
  readonly requested: number;
  readonly accepted: number;
  readonly restocked: number;
}

/** Inspection cohérente : 0 ≤ revendu ≤ accepté ≤ demandé, entiers. */
export const isValidInspection = (line: InspectedLine): boolean =>
  [line.accepted, line.restocked].every(Number.isInteger) && line.accepted >= 0 && line.accepted <= line.requested && line.restocked >= 0 && line.restocked <= line.accepted;

/** Montant remboursé : quantités acceptées × prix TTC unitaire figé (port exclu). */
export const returnRefundMinor = (lines: readonly { readonly accepted: number; readonly unitPriceMinor: number }[]): number =>
  lines.reduce((sum, line) => sum + line.accepted * line.unitPriceMinor, 0);

/** Référence Logistics des remises en stock d'une commande (remboursement ou retour RMA : plafond commun au sorti). */
export const returnReference = (orderNumber: string) => `RET-${orderNumber}`;
