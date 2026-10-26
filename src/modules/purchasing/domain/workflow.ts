/**
 * Cycle de vie d'une commande fournisseur (core/workflow) :
 *
 *   DRAFT → SENT → PARTIALLY_RECEIVED → RECEIVED → CLOSED
 *
 * Retour possible SENT → DRAFT (tant que rien n'est reçu) ; annulation depuis DRAFT ou SENT ;
 * une commande partiellement reçue peut être soldée (CLOSED, reliquat abandonné). Les statuts
 * PARTIALLY_RECEIVED et RECEIVED sont posés par les réceptions, jamais à la main.
 * Le numéro de commande est attribué à l'envoi (SENT).
 */
import type { WorkflowDefinition } from "@/core/workflow";

export const PURCHASE_ORDER_STATUSES = ["DRAFT", "SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];
/** Alias attendu par le socle généré. */
export const PURCHASING_STATUSES = PURCHASE_ORDER_STATUSES;
export type PurchasingStatus = PurchaseOrderStatus;

export const EDITABLE_STATUSES: readonly PurchaseOrderStatus[] = ["DRAFT"];
export const RECEIVABLE_STATUSES: readonly PurchaseOrderStatus[] = ["SENT", "PARTIALLY_RECEIVED"];
export const FINAL_STATUSES: readonly PurchaseOrderStatus[] = ["CLOSED", "CANCELLED"];

export const purchaseOrderWorkflow: WorkflowDefinition<PurchaseOrderStatus> = {
  states: PURCHASE_ORDER_STATUSES,
  transitions: [
    { from: "DRAFT", to: "SENT" },
    { from: "SENT", to: "DRAFT" },
    { from: "DRAFT", to: "CANCELLED" },
    { from: "SENT", to: "CANCELLED" },
    { from: "SENT", to: "PARTIALLY_RECEIVED" },
    { from: "SENT", to: "RECEIVED" },
    { from: "PARTIALLY_RECEIVED", to: "RECEIVED" },
    { from: "PARTIALLY_RECEIVED", to: "CLOSED" },
    { from: "RECEIVED", to: "CLOSED" },
  ],
};

/** Statuts posés uniquement par une réception. */
export const RECEIPT_DRIVEN_STATUSES: readonly PurchaseOrderStatus[] = ["PARTIALLY_RECEIVED", "RECEIVED"];

export const isEditable = (status: PurchaseOrderStatus) => EDITABLE_STATUSES.includes(status);
export const isReceivable = (status: PurchaseOrderStatus) => RECEIVABLE_STATUSES.includes(status);

/** Transitions manuelles proposées depuis `from`, dans l'ordre du cycle. */
export const nextStatuses = (from: PurchaseOrderStatus): readonly PurchaseOrderStatus[] =>
  PURCHASE_ORDER_STATUSES.filter((to) => !RECEIPT_DRIVEN_STATUSES.includes(to) && purchaseOrderWorkflow.transitions.some((t) => t.from === from && t.to === to));

/** Numéro attribué à l'envoi (sans trou, `core/numbering`). */
export const assignsNumber = (from: PurchaseOrderStatus, to: PurchaseOrderStatus) => from === "DRAFT" && to === "SENT";
