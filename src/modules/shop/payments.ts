/**
 * Paiement des commandes boutique via core/payments (objet `shop-order`, sujet = id commande).
 *
 * - Payé → PENDING_PAYMENT (ou EXPIRED : paiement tardif acquis) passe PAID, les réservations
 *   Logistics sont consommées (mouvements de sortie `CMD-…`) ; un manque de stock éventuel
 *   (réservation libérée puis stock vendu) est consigné dans `stockShortage`, jamais d'échec.
 * - Paiement reçu sur une commande annulée : `paidAt` enregistré, anomalie journalisée
 *   (remboursement à traiter). Idempotent : un second webhook ne refait rien.
 * - Expiré → PENDING_PAYMENT passe EXPIRED, stock libéré.
 * - Remboursements : core/refunds (voir ./refunds.ts — remise en stock, REFUNDED).
 * - Balayage (cron payments-expire) : commandes échues sans webhook, réservations échues,
 *   paniers invités abandonnés.
 */
import { and, eq, lt } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import type { Payment } from "@database/schemas/payments.schema";
import { registerPaymentPurpose } from "@/core/payments";
import { canTransition } from "@/core/workflow";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";
import { logisticsStockPort } from "@/modules/logistics/services/logistics.service";
import { orders } from "./schema/orders";
import { orderWorkflow } from "./domain/orders";
import { lockOrder, reservationReference, SHOP_ORDER_PAYMENT_PURPOSE } from "./services/order.service";
import { cartService } from "./services/cart.service";

/** Marge après l'échéance avant le balayage (le webhook d'expiration arrive d'abord). */
const SWEEP_GRACE_MS = 10 * 60_000;

const markPaid = (tx: DbTransaction, payment: Payment, orderId: string) =>
  Effect.gen(function* () {
    const order = yield* lockOrder(tx, orderId);
    if (!order) return yield* Effect.logWarning("[shop] paiement reçu pour une commande inconnue", { paymentId: payment.id });
    if (order.paidAt) return;
    const paidAt = payment.paidAt ?? new Date();
    if (!canTransition(orderWorkflow, order.status, "PAID")) {
      yield* dbTry("shop.payment.late", () => tx.update(orders).set({ paidAt, paymentId: payment.id }).where(eq(orders.id, orderId)));
      return yield* Effect.logError("[shop] paiement reçu sur une commande non payable — remboursement à traiter", { orderId, status: order.status, paymentId: payment.id });
    }
    const consumed = yield* logisticsStockPort.consumeReservations(tx, {
      organizationId: order.organizationId, reference: reservationReference(order.id), movementReference: order.number,
    }).pipe(Effect.catch((error) =>
      error._tag === "DbError"
        ? Effect.fail(error)
        : Effect.logError("[shop] sortie de stock impossible", { orderId, error }).pipe(Effect.as({ issued: [], shortages: ["?"] }))));
    const stockShortage = consumed.shortages.length > 0 ? consumed.shortages.join(", ").slice(0, 500) : null;
    if (stockShortage) yield* Effect.logError("[shop] commande payée avec stock insuffisant", { orderId, skus: stockShortage });
    yield* dbTry("shop.payment.paid", () => tx.update(orders).set({ status: "PAID", paidAt, paymentId: payment.id, stockShortage }).where(eq(orders.id, orderId)));
  });

const markExpired = (tx: DbTransaction, _payment: Payment, orderId: string) =>
  Effect.gen(function* () {
    const order = yield* lockOrder(tx, orderId);
    if (!order || order.status !== "PENDING_PAYMENT" || order.paidAt) return;
    yield* dbTry("shop.payment.expire", () => tx.update(orders).set({ status: "EXPIRED" }).where(eq(orders.id, orderId)));
    yield* logisticsStockPort.releaseReservations(tx, reservationReference(orderId));
  });

/** Filet de sécurité : commandes échues sans webhook, réservations échues, paniers abandonnés. */
export const sweepShopOrders = (now: Date = new Date()) =>
  Effect.gen(function* () {
    const expired = yield* dbTry("shop.payment.sweep", () =>
      getDrizzle().update(orders).set({ status: "EXPIRED" })
        .where(and(eq(orders.status, "PENDING_PAYMENT"), lt(orders.expiresAt, new Date(now.getTime() - SWEEP_GRACE_MS))))
        .returning({ id: orders.id }));
    yield* logisticsStockPort.releaseExpiredReservations(now);
    yield* cartService.purgeStaleGuestCarts(now);
    return expired.length;
  });

export const registerShopPayments = () =>
  registerPaymentPurpose({ purpose: SHOP_ORDER_PAYMENT_PURPOSE, onSucceeded: markPaid, onExpired: markExpired, sweep: sweepShopOrders });
