/**
 * Point unique d'écriture des statuts de commande publiés (`PAID`, `SHIPPED`, `REFUNDED`) :
 * met à jour la commande et enregistre l'événement correspondant dans l'outbox de la même
 * transaction (`order.paid`, `order.shipped`, `order.refunded`).
 */
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { recordEvent } from "@/core/events/outbox";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";
import { serializeOrder } from "../api/public-api";
import { orders } from "../schema/orders";

export const ORDER_STATUS_EVENTS = { PAID: "order.paid", SHIPPED: "order.shipped", REFUNDED: "order.refunded" } as const;
export type PublishedOrderStatus = keyof typeof ORDER_STATUS_EVENTS;

export const setOrderStatus = (
  tx: DbTransaction,
  orderId: string,
  status: PublishedOrderStatus,
  patch: Partial<Omit<typeof orders.$inferInsert, "status">>,
  operation: string,
) =>
  Effect.gen(function* () {
    const [row] = yield* dbTry(operation, () => tx.update(orders).set({ ...patch, status }).where(eq(orders.id, orderId)).returning());
    if (row) yield* recordEvent(tx, ORDER_STATUS_EVENTS[status], serializeOrder(row), { organizationId: row.organizationId ?? null });
    return row;
  });
