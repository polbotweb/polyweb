/**
 * Réaction de la boutique aux remboursements core/refunds (objet `shop-order`).
 *
 * - Remise en stock (Logistics, mouvements `return` de référence `RET-<n° commande>`, dans
 *   l'entrepôt de sortie) d'une commande PAYÉE non expédiée : tout le reste si le
 *   remboursement est total, sinon les lignes `metadata.restockLines` ({ variantId, quantity }).
 *   `metadata.restock = false` la désactive (retours RMA : la marchandise rentre à réception).
 * - Remboursement total → commande REFUNDED (depuis PAID, SHIPPED ou DELIVERED).
 * - Remboursement d'un retour (`metadata.returnId`) → retour REFUNDED, même transaction.
 * Règle métier non satisfaite : journalisée, jamais d'échec (l'argent est déjà rendu).
 */
import { and, eq } from "drizzle-orm";
import { Effect, Schema } from "effect";
import { registerRefundHandler, RefundNotAllowedError, type RefundOutcome } from "@/core/refunds";
import { canTransition } from "@/core/workflow";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";
import { logisticsStockPort } from "@/modules/logistics/services/logistics.service";
import { orders } from "./schema/orders";
import { orderReturns } from "./schema/returns";
import { orderWorkflow } from "./domain/orders";
import { returnReference } from "./domain/returns";
import { lockOrder, SHOP_ORDER_PAYMENT_PURPOSE } from "./services/order.service";
import { markReturnRefunded } from "./services/return.service";

export { returnReference };

const RestockLines = Schema.Array(Schema.Struct({ variantId: Schema.String, quantity: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))) }));
const decodeRestockLines = Schema.decodeUnknownOption(RestockLines);

const restock = (tx: DbTransaction, outcome: RefundOutcome, order: { readonly id: string; readonly number: string; readonly organizationId: string | null }) =>
  Effect.gen(function* () {
    const metadata = outcome.refund.metadata;
    if (metadata.restock === false) return;
    const lines = metadata.restockLines === undefined ? undefined : decodeRestockLines(metadata.restockLines);
    if (lines !== undefined && lines._tag === "None") return yield* Effect.logError("[shop] lignes de remise en stock illisibles", { orderId: order.id, refundId: outcome.refund.id });
    // Remboursement partiel sans lignes : montant (geste commercial), pas de marchandise.
    if (!outcome.fullyRefunded && !lines) return;
    yield* logisticsStockPort.returnIssued(tx, {
      organizationId: order.organizationId, issueReference: order.number, returnReference: returnReference(order.number), lines: lines?.value,
    }, outcome.refund.requestedBy).pipe(Effect.catch((error) =>
      error._tag === "DbError" ? Effect.fail(error) : Effect.logError("[shop] remise en stock impossible", { orderId: order.id, error })));
  });

const onRefundSucceeded = (tx: DbTransaction, outcome: RefundOutcome) =>
  Effect.gen(function* () {
    const order = yield* lockOrder(tx, outcome.subjectId);
    if (!order) return yield* Effect.logWarning("[shop] remboursement pour une commande inconnue", { refundId: outcome.refund.id });
    if (order.status === "PAID") yield* restock(tx, outcome, order);
    if (typeof outcome.refund.metadata.returnId === "string") yield* markReturnRefunded(tx, outcome.refund.metadata.returnId, outcome.refund.id);
    if (!outcome.fullyRefunded) return;
    if (!canTransition(orderWorkflow, order.status, "REFUNDED")) {
      if (order.status !== "REFUNDED") yield* Effect.logWarning("[shop] remboursement total sur une commande non remboursable", { orderId: order.id, status: order.status });
      return;
    }
    yield* dbTry("shop.refund.status", () => tx.update(orders).set({ status: "REFUNDED" }).where(eq(orders.id, order.id)));
  });

/** Avant l'appel fournisseur : la commande existe dans le tenant du paiement ; un retour cité est inspecté et de cette commande. */
const validateRefund = (tx: DbTransaction, input: {
  readonly payment: { readonly id: string; readonly organizationId: string | null };
  readonly subjectId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}) =>
  Effect.gen(function* () {
    const order = yield* lockOrder(tx, input.subjectId);
    if (!order || order.organizationId !== input.payment.organizationId) return yield* new RefundNotAllowedError({ paymentId: input.payment.id, reason: "handler", detail: "order" });
    const returnId = input.metadata.returnId;
    if (returnId === undefined) return;
    const [rma] = typeof returnId === "string"
      ? yield* dbTry("shop.refund.return", () => tx.select({ status: orderReturns.status }).from(orderReturns).where(and(eq(orderReturns.id, returnId), eq(orderReturns.orderId, order.id))).limit(1))
      : [];
    if (rma?.status !== "INSPECTED") return yield* new RefundNotAllowedError({ paymentId: input.payment.id, reason: "handler", detail: "return" });
  });

export const registerShopRefunds = () => registerRefundHandler({ purpose: SHOP_ORDER_PAYMENT_PURPOSE, validate: validateRefund, onSucceeded: onRefundSucceeded });
