/**
 * Cycle de vie d'une commande (core/workflow). Les transitions « système » (paiement reçu,
 * échéance) sont appliquées par les réactions core/payments ; l'administration ne peut
 * qu'expédier, livrer, annuler une commande non payée ou constater un remboursement.
 */
import type { WorkflowDefinition } from "@/core/workflow";
import type { NumberingScheme } from "@/core/numbering";

export const ORDER_STATUSES = ["PENDING_PAYMENT", "PAID", "SHIPPED", "DELIVERED", "CANCELLED", "EXPIRED", "REFUNDED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const isOrderStatus = (value: string): value is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(value);

export const orderWorkflow: WorkflowDefinition<OrderStatus> = {
  states: ORDER_STATUSES,
  transitions: [
    { from: "PENDING_PAYMENT", to: "PAID" },
    { from: "PENDING_PAYMENT", to: "CANCELLED" },
    { from: "PENDING_PAYMENT", to: "EXPIRED" },
    { from: "PAID", to: "SHIPPED" },
    { from: "PAID", to: "REFUNDED" },
    { from: "SHIPPED", to: "DELIVERED" },
    { from: "SHIPPED", to: "REFUNDED" },
    { from: "DELIVERED", to: "REFUNDED" },
  ],
};

/** Transitions déclenchables depuis l'administration (le paiement et l'échéance sont réservés au système). */
export const ADMIN_ORDER_TRANSITIONS: readonly OrderStatus[] = ["SHIPPED", "DELIVERED", "CANCELLED"];

/** Statuts qui comptent dans le chiffre d'affaires encaissé. */
export const REVENUE_ORDER_STATUSES: readonly OrderStatus[] = ["PAID", "SHIPPED", "DELIVERED"];

export const ORDER_NUMBERING_KEY = "shop.order";
/** Sans trou, remise annuelle, attribué à la création de la commande (dans sa transaction). */
export const DEFAULT_ORDER_NUMBERING: NumberingScheme = { pattern: "{prefix}-{YYYY}-{seq:6}", reset: "yearly", prefix: "CMD" };
