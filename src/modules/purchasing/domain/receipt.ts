/**
 * Réception de marchandises : contrôle des quantités reçues contre le reliquat de chaque ligne
 * (pas de sur-réception) et statut résultant de la commande (partielle ou complète).
 */
import { Effect } from "effect";
import { InvalidReceiptError } from "./errors";

export interface OrderLineState {
  readonly id: string;
  readonly sku: string;
  readonly quantity: number;
  readonly receivedQuantity: number;
}

export interface ReceiptLineInput {
  readonly lineId: string;
  readonly quantity: number;
}

export const outstanding = (line: Pick<OrderLineState, "quantity" | "receivedQuantity">) => Math.max(0, line.quantity - line.receivedQuantity);

export const isFullyReceived = (lines: readonly Pick<OrderLineState, "quantity" | "receivedQuantity">[]) => lines.every((l) => outstanding(l) === 0);

/** Lignes de réception validées (quantités nulles ignorées), cumuls mis à jour et statut résultant. */
export const planReceipt = (orderLines: readonly OrderLineState[], requested: readonly ReceiptLineInput[]) =>
  Effect.gen(function* () {
    const byId = new Map(orderLines.map((l) => [l.id, l]));
    const received = new Map(orderLines.map((l) => [l.id, l.receivedQuantity]));
    const lines: { lineId: string; sku: string; quantity: number }[] = [];
    for (const entry of requested) {
      if (entry.quantity === 0) continue;
      const line = byId.get(entry.lineId);
      if (!line) return yield* new InvalidReceiptError({ field: "line", value: entry.lineId });
      if (!Number.isSafeInteger(entry.quantity) || entry.quantity < 0) return yield* new InvalidReceiptError({ field: "quantity", value: String(entry.quantity) });
      const next = received.get(line.id)! + entry.quantity;
      if (next > line.quantity) return yield* new InvalidReceiptError({ field: "quantity", value: `${line.sku}: ${next}/${line.quantity}` });
      received.set(line.id, next);
      lines.push({ lineId: line.id, sku: line.sku, quantity: entry.quantity });
    }
    if (lines.length === 0) return yield* new InvalidReceiptError({ field: "lines", value: "0" });
    const after = orderLines.map((l) => ({ quantity: l.quantity, receivedQuantity: received.get(l.id)! }));
    return { lines, received, status: isFullyReceived(after) ? ("RECEIVED" as const) : ("PARTIALLY_RECEIVED" as const) };
  });
