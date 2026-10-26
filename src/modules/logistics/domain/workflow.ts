/**
 * Cycle de vie d'une expédition (core/workflow) :
 *
 *   DRAFT → READY → SHIPPED → DELIVERED
 *
 * Retour possible READY → DRAFT ; annulation depuis DRAFT ou READY ; une expédition partie peut
 * revenir (SHIPPED / DELIVERED → RETURNED). Le stock sort à l'expédition (SHIPPED) et rentre au
 * retour (RETURNED). Le numéro de bon de livraison est attribué au passage à READY.
 */
import type { WorkflowDefinition } from "@/core/workflow";

export const SHIPMENT_STATUSES = ["DRAFT", "READY", "SHIPPED", "DELIVERED", "RETURNED", "CANCELLED"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
/** Alias attendu par le socle généré. */
export const LOGISTICS_STATUSES = SHIPMENT_STATUSES;
export type LogisticsStatus = ShipmentStatus;

export const EDITABLE_STATUSES: readonly ShipmentStatus[] = ["DRAFT"];
export const FINAL_STATUSES: readonly ShipmentStatus[] = ["DELIVERED", "RETURNED", "CANCELLED"];

export const shipmentWorkflow: WorkflowDefinition<ShipmentStatus> = {
  states: SHIPMENT_STATUSES,
  transitions: [
    { from: "DRAFT", to: "READY" },
    { from: "READY", to: "DRAFT" },
    { from: "READY", to: "SHIPPED" },
    { from: "SHIPPED", to: "DELIVERED" },
    { from: "SHIPPED", to: "RETURNED" },
    { from: "DELIVERED", to: "RETURNED" },
    { from: "DRAFT", to: "CANCELLED" },
    { from: "READY", to: "CANCELLED" },
  ],
};

export const isEditable = (status: ShipmentStatus) => EDITABLE_STATUSES.includes(status);

/** Statuts proposés depuis `from`, dans l'ordre du cycle. */
export const nextStatuses = (from: ShipmentStatus): readonly ShipmentStatus[] =>
  SHIPMENT_STATUSES.filter((to) => shipmentWorkflow.transitions.some((t) => t.from === from && t.to === to));

/** Effet de la transition sur le stock : sortie à l'expédition, rentrée au retour. */
export const stockEffect = (from: ShipmentStatus, to: ShipmentStatus): "issue" | "return" | null =>
  to === "SHIPPED" && from === "READY" ? "issue" : to === "RETURNED" ? "return" : null;

/** Numéro attribué au passage à READY (sans trou, `core/numbering`). */
export const assignsNumber = (from: ShipmentStatus, to: ShipmentStatus) => from === "DRAFT" && to === "READY";
