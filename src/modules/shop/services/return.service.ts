/**
 * Retours clients (RMA) — service Effect. Voir `domain/returns.ts` et docs/shop-returns.md.
 *
 * - Demande (client, lien signé) : commande LIVRÉE verrouillée `FOR UPDATE` (deux demandes
 *   concurrentes ne dépassent jamais la quantité commandée), quantités contrôlées, numéro RMA.
 * - Administration : approuver / refuser / annuler, réceptionner, inspecter. L'inspection fixe
 *   les quantités acceptées et revendables : les revendables rentrent en stock (Logistics,
 *   mouvement `return`, plafonné au sorti) dans la MÊME transaction, puis le remboursement est
 *   demandé à core/refunds (clé `rma:<id>:<tentative>`, `metadata.restock = false`).
 * - Le passage `REFUNDED` est porté par la réaction boutique au remboursement constaté
 *   (`markReturnRefunded`, appelée par `refunds.ts`) : appel synchrone ou webhook, même chemin.
 */
import { Effect } from "effect";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { refunds } from "@database/schemas/refunds.schema";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { fail } from "@/lib/effect/failure";
import { canTransition } from "@/core/workflow";
import { assignDocumentNumber } from "@/core/numbering";
import { money, type CurrencyCode } from "@/core/money";
import { requestRefund } from "@/core/refunds";
import { logisticsStockPort } from "@/modules/logistics/services/logistics.service";
import { orderLines, orders } from "../schema/orders";
import { orderReturnLines, orderReturns, type OrderReturnRow } from "../schema/returns";
import {
  checkReturnRequest, DEFAULT_RETURN_NUMBERING, isValidInspection, OPEN_RETURN_STATUSES, RETURN_NOTE_MAX, RETURN_NUMBERING_KEY,
  returnableQuantities, returnReference, returnRefundMinor, returnWorkflow, type ReturnCondition, type ReturnReason, type ReturnStatus,
} from "../domain/returns";
import { lockOrder, SHIPPING_LINE_SKU } from "./order.service";

export const RETURNS_PAGE_SIZE = 25;

const sameTenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));
const note = (value: string | null | undefined) => value?.trim().slice(0, RETURN_NOTE_MAX) || null;

const lockReturn = (tx: DbTransaction, id: string, organizationId: string | null) =>
  dbTry("shop.return.lock", () => tx.select().from(orderReturns).where(and(eq(orderReturns.id, id), sameTenant(orderReturns.organizationId, organizationId))).limit(1).for("update"))
    .pipe(Effect.map(([row]) => row ?? null));

/** Quantités déjà engagées par des retours ouverts, par ligne de commande. */
const takenQuantities = (tx: DbTransaction, orderId: string) =>
  dbTry("shop.return.taken", () =>
    tx.select({ orderLineId: orderReturnLines.orderLineId, quantity: orderReturnLines.quantity })
      .from(orderReturnLines).innerJoin(orderReturns, eq(orderReturns.id, orderReturnLines.returnId))
      .where(and(eq(orderReturns.orderId, orderId), inArray(orderReturns.status, [...OPEN_RETURN_STATUSES]))));

const returnableLinesOf = (tx: DbTransaction, orderId: string) =>
  dbTry("shop.return.orderLines", () => tx.select().from(orderLines).where(eq(orderLines.orderId, orderId)).orderBy(asc(orderLines.position)))
    .pipe(Effect.map((lines) => lines.filter((line) => line.sku !== SHIPPING_LINE_SKU)));

const transitionTo = (tx: DbTransaction, current: OrderReturnRow, to: ReturnStatus, patch: Partial<typeof orderReturns.$inferInsert> = {}) =>
  Effect.gen(function* () {
    if (!canTransition(returnWorkflow, current.status, to)) return yield* fail("CONFLICT", `Transition ${current.status} → ${to} interdite.`);
    const [updated] = yield* dbTry("shop.return.status", () =>
      tx.update(orderReturns).set({ ...patch, status: to }).where(and(eq(orderReturns.id, current.id), eq(orderReturns.status, current.status))).returning());
    if (!updated) return yield* fail("CONFLICT", "Retour modifié entre-temps.");
    return updated;
  });

export interface ReturnRequestInput {
  readonly orderId: string;
  readonly organizationId: string | null;
  readonly reason: ReturnReason;
  readonly note?: string | null;
  readonly lines: readonly { readonly orderLineId: string; readonly quantity: number }[];
  readonly now?: Date;
}

export interface InspectionInput {
  readonly lines: readonly { readonly lineId: string; readonly accepted: number; readonly restocked: number }[];
  readonly note?: string | null;
}

/** Retour remboursé : appelé DANS la transaction qui constate le remboursement (refunds.ts). */
export const markReturnRefunded = (tx: DbTransaction, returnId: string, refundId: string, now: Date = new Date()) =>
  Effect.gen(function* () {
    const [current] = yield* dbTry("shop.return.refunded.lock", () => tx.select().from(orderReturns).where(eq(orderReturns.id, returnId)).limit(1).for("update"));
    if (!current) return yield* Effect.logWarning("[shop] remboursement d'un retour inconnu", { returnId, refundId });
    if (current.status === "REFUNDED") return;
    if (current.status !== "INSPECTED") return yield* Effect.logWarning("[shop] remboursement d'un retour non inspecté", { returnId, status: current.status });
    yield* dbTry("shop.return.refunded", () =>
      tx.update(orderReturns).set({ status: "REFUNDED", refundId, closedAt: now }).where(and(eq(orderReturns.id, returnId), eq(orderReturns.status, "INSPECTED"))));
  });

export const returnService = {
  /** Lignes retournables d'une commande (quantité restante par ligne). */
  returnable: (orderId: string) =>
    dbTransaction("shop.return.returnable", (tx) =>
      Effect.gen(function* () {
        const lines = yield* returnableLinesOf(tx, orderId);
        const left = returnableQuantities(lines, yield* takenQuantities(tx, orderId));
        return lines.map((line) => ({ line, remaining: left.get(line.id) ?? 0 }));
      })),

  /** Demande client sur une commande livrée (jeton déjà vérifié par l'appelant). */
  request: (input: ReturnRequestInput) =>
    dbTransaction("shop.return.request", (tx) =>
      Effect.gen(function* () {
        const order = yield* lockOrder(tx, input.orderId);
        if (!order || (order.organizationId ?? null) !== input.organizationId) return yield* fail("NOT_FOUND", "Commande introuvable.");
        if (order.status !== "DELIVERED") return yield* fail("CONFLICT", "Seule une commande livrée peut faire l'objet d'un retour.");
        const lines = yield* returnableLinesOf(tx, order.id);
        const requested = input.lines.filter((line) => line.quantity !== 0);
        const problem = checkReturnRequest(requested, returnableQuantities(lines, yield* takenQuantities(tx, order.id)));
        if (problem) return yield* fail("BAD_REQUEST", problem);
        const now = input.now ?? new Date();
        const { number } = yield* assignDocumentNumber(tx, { organizationId: order.organizationId, key: RETURN_NUMBERING_KEY, scheme: DEFAULT_RETURN_NUMBERING, date: now.toISOString().slice(0, 10) });
        const [created] = yield* dbTry("shop.return.insert", () => tx.insert(orderReturns).values({
          organizationId: order.organizationId, orderId: order.id, number, reason: input.reason, customerNote: note(input.note), currency: order.currency, createdAt: now,
        }).returning());
        yield* dbTry("shop.return.lines", () => tx.insert(orderReturnLines).values(requested.map((line) => ({ returnId: created!.id, orderLineId: line.orderLineId, quantity: line.quantity }))));
        return created!;
      })),

  approve: (id: string, organizationId: string | null, userId: string, now: Date = new Date()) =>
    dbTransaction("shop.return.approve", (tx) =>
      Effect.gen(function* () {
        const current = yield* lockReturn(tx, id, organizationId);
        if (!current) return yield* fail("NOT_FOUND", "Retour introuvable.");
        return yield* transitionTo(tx, current, "APPROVED", { approvedBy: userId, approvedAt: now });
      })),

  reject: (id: string, organizationId: string | null, adminNote: string | null, now: Date = new Date()) =>
    dbTransaction("shop.return.reject", (tx) =>
      Effect.gen(function* () {
        const current = yield* lockReturn(tx, id, organizationId);
        if (!current) return yield* fail("NOT_FOUND", "Retour introuvable.");
        return yield* transitionTo(tx, current, "REJECTED", { adminNote: note(adminNote), closedAt: now });
      })),

  cancel: (id: string, organizationId: string | null, now: Date = new Date()) =>
    dbTransaction("shop.return.cancel", (tx) =>
      Effect.gen(function* () {
        const current = yield* lockReturn(tx, id, organizationId);
        if (!current) return yield* fail("NOT_FOUND", "Retour introuvable.");
        return yield* transitionTo(tx, current, "CANCELLED", { closedAt: now });
      })),

  receive: (id: string, organizationId: string | null, userId: string, now: Date = new Date()) =>
    dbTransaction("shop.return.receive", (tx) =>
      Effect.gen(function* () {
        const current = yield* lockReturn(tx, id, organizationId);
        if (!current) return yield* fail("NOT_FOUND", "Retour introuvable.");
        return yield* transitionTo(tx, current, "RECEIVED", { receivedBy: userId, receivedAt: now });
      })),

  /**
   * Inspection : quantités acceptées (remboursées) et revendables (remises en stock) par ligne,
   * stock posté dans la même transaction. Rien d'accepté → CLOSED, sinon INSPECTED + montant.
   */
  inspect: (id: string, organizationId: string | null, userId: string, input: InspectionInput, now: Date = new Date()) =>
    dbTransaction("shop.return.inspect", (tx) =>
      Effect.gen(function* () {
        const current = yield* lockReturn(tx, id, organizationId);
        if (!current) return yield* fail("NOT_FOUND", "Retour introuvable.");
        if (current.status !== "RECEIVED") return yield* fail("CONFLICT", "Seul un retour réceptionné s'inspecte.");
        const order = yield* lockOrder(tx, current.orderId);
        if (!order) return yield* fail("NOT_FOUND", "Commande introuvable.");
        const rows = yield* dbTry("shop.return.inspect.lines", () =>
          tx.select({ line: orderReturnLines, orderLine: orderLines }).from(orderReturnLines)
            .innerJoin(orderLines, eq(orderLines.id, orderReturnLines.orderLineId)).where(eq(orderReturnLines.returnId, current.id)));
        const decided = new Map(input.lines.map((line) => [line.lineId, line]));
        if (decided.size !== input.lines.length || input.lines.some((line) => !rows.some((row) => row.line.id === line.lineId))) return yield* fail("BAD_REQUEST", "inspection");
        const outcome = rows.map((row) => {
          const decision = decided.get(row.line.id) ?? { accepted: 0, restocked: 0 };
          return { row, accepted: decision.accepted, restocked: decision.restocked };
        });
        if (!outcome.every((line) => isValidInspection({ requested: line.row.line.quantity, accepted: line.accepted, restocked: line.restocked }))) return yield* fail("BAD_REQUEST", "inspection");
        for (const line of outcome) {
          const condition: ReturnCondition | null = line.accepted === 0 ? null : line.restocked === line.accepted ? "resellable" : "damaged";
          yield* dbTry("shop.return.inspect.line", () => tx.update(orderReturnLines).set({ acceptedQuantity: line.accepted, restockedQuantity: line.restocked, condition }).where(eq(orderReturnLines.id, line.row.line.id)));
        }
        const restockLines = outcome.filter((line) => line.restocked > 0 && line.row.orderLine.variantId)
          .map((line) => ({ variantId: line.row.orderLine.variantId!, quantity: line.restocked }));
        const movements = restockLines.length === 0 ? [] : yield* logisticsStockPort.returnIssued(tx, {
          organizationId: order.organizationId, issueReference: order.number, returnReference: returnReference(order.number), lines: restockLines,
        }, userId);
        const refundMinor = returnRefundMinor(outcome.map((line) => ({ accepted: line.accepted, unitPriceMinor: line.row.orderLine.unitPriceMinor })));
        const patch = { inspectedBy: userId, inspectedAt: now, refundMinor, adminNote: note(input.note) ?? current.adminNote };
        const updated = refundMinor === 0
          ? yield* transitionTo(tx, current, "CLOSED", { ...patch, closedAt: now })
          : yield* transitionTo(tx, current, "INSPECTED", patch);
        return { updated, restocked: movements.reduce((sum, movement) => sum + movement.delta, 0) };
      })),

  /**
   * Remboursement d'un retour inspecté (core/refunds). Clé `rma:<id>:<tentative>` : un double
   * clic ou un rejeu renvoie le même remboursement ; après un échec constaté, nouvelle tentative.
   */
  refund: (id: string, organizationId: string | null, userId: string) =>
    Effect.gen(function* () {
      const prepared = yield* dbTransaction("shop.return.refund.prepare", (tx) =>
        Effect.gen(function* () {
          const current = yield* lockReturn(tx, id, organizationId);
          if (!current) return yield* fail("NOT_FOUND", "Retour introuvable.");
          if (current.status === "REFUNDED") return { current, done: true as const };
          if (current.status !== "INSPECTED" || !current.refundMinor) return yield* fail("CONFLICT", "Retour non remboursable.");
          const [order] = yield* dbTry("shop.return.refund.order", () => tx.select().from(orders).where(eq(orders.id, current.orderId)).limit(1));
          if (!order?.paymentId) return yield* fail("CONFLICT", "Commande sans paiement en ligne.");
          let attempts = current.refundAttempts;
          if (current.refundId) {
            const [previous] = yield* dbTry("shop.return.refund.previous", () => tx.select({ status: refunds.status }).from(refunds).where(eq(refunds.id, current.refundId!)).limit(1));
            if (previous?.status === "failed" || previous?.status === "cancelled") {
              attempts += 1;
              yield* dbTry("shop.return.refund.retry", () => tx.update(orderReturns).set({ refundAttempts: attempts, refundId: null }).where(eq(orderReturns.id, current.id)));
            }
          }
          return { current, done: false as const, paymentId: order.paymentId, attempts };
        }));
      if (prepared.done) return { returnRow: prepared.current, refund: null };
      const amount = yield* money(prepared.current.refundMinor!, prepared.current.currency as CurrencyCode);
      const refund = yield* requestRefund({
        paymentId: prepared.paymentId, organizationId, amount, reason: "return", note: `RMA ${prepared.current.number}`,
        idempotencyKey: `rma:${prepared.current.id}:${prepared.attempts}`, requestedBy: userId,
        metadata: { restock: false, returnId: prepared.current.id },
      });
      const [returnRow] = yield* dbTry("shop.return.refund.link", () =>
        getDrizzle().update(orderReturns).set({ refundId: refund.id }).where(and(eq(orderReturns.id, prepared.current.id), or(isNull(orderReturns.refundId), eq(orderReturns.refundId, refund.id)))).returning());
      return { returnRow: returnRow ?? prepared.current, refund };
    }),

  byId: (id: string, organizationId: string | null) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("shop.return.byId", () => getDrizzle().select().from(orderReturns).where(and(eq(orderReturns.id, id), sameTenant(orderReturns.organizationId, organizationId))).limit(1));
      if (!row) return null;
      const [order] = yield* dbTry("shop.return.byId.order", () => getDrizzle().select().from(orders).where(eq(orders.id, row.orderId)).limit(1));
      const lines = yield* dbTry("shop.return.byId.lines", () =>
        getDrizzle().select({ line: orderReturnLines, orderLine: orderLines }).from(orderReturnLines)
          .innerJoin(orderLines, eq(orderLines.id, orderReturnLines.orderLineId)).where(eq(orderReturnLines.returnId, row.id)).orderBy(asc(orderLines.position)));
      const [refund] = row.refundId ? yield* dbTry("shop.return.byId.refund", () => getDrizzle().select().from(refunds).where(eq(refunds.id, row.refundId!)).limit(1)) : [];
      return { returnRow: row, order: order!, lines, refund: refund ?? null };
    }),

  /** Retours d'une commande (fiche commande, page publique), plus récents d'abord. */
  forOrder: (orderId: string) =>
    dbTry("shop.return.forOrder", () => getDrizzle().select().from(orderReturns).where(eq(orderReturns.orderId, orderId)).orderBy(desc(orderReturns.createdAt))),

  /** Liste admin : statut, recherche n° RMA / n° commande / e-mail. */
  list: (organizationId: string | null, filters: { readonly status?: ReturnStatus; readonly search?: string }, page = 1) =>
    Effect.gen(function* () {
      const conditions: (SQL | undefined)[] = [sameTenant(orderReturns.organizationId, organizationId)];
      if (filters.status) conditions.push(eq(orderReturns.status, filters.status));
      const search = filters.search?.trim().slice(0, 100);
      if (search) {
        const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        conditions.push(or(ilike(orderReturns.number, pattern), ilike(orders.number, pattern), ilike(orders.email, pattern)));
      }
      const where = and(...conditions);
      const offset = (Math.max(1, Math.floor(page)) - 1) * RETURNS_PAGE_SIZE;
      const [rows, totals] = yield* Effect.all([
        dbTry("shop.return.list", () => getDrizzle().select({ returnRow: orderReturns, orderNumber: orders.number, email: orders.email }).from(orderReturns)
          .innerJoin(orders, eq(orders.id, orderReturns.orderId)).where(where).orderBy(desc(orderReturns.createdAt), desc(orderReturns.number)).limit(RETURNS_PAGE_SIZE).offset(offset)),
        dbTry("shop.return.count", () => getDrizzle().select({ n: sql<number>`count(*)::int` }).from(orderReturns).innerJoin(orders, eq(orders.id, orderReturns.orderId)).where(where)),
      ]);
      return { rows, total: Number(totals[0]?.n ?? 0) };
    }),
};
