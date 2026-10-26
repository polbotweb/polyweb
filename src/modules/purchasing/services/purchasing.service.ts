/**
 * Service Effect du domaine purchasing : fournisseurs (code unique par tenant), commandes
 * fournisseur (lignes résolues en articles logistiques, totaux core/money, cycle core/workflow,
 * numéro BC core/numbering à l'envoi) et réceptions (numéro BR, contrôle du reliquat, une entrée
 * de stock `receipt` par ligne via le port logistique, dans la même transaction).
 * Erreurs de domaine → BAD_REQUEST ; une référence d'un autre tenant → NOT_FOUND (sans fuite).
 */
import { Effect } from "effect";
import { and, asc, eq, inArray, isNull, ne, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { fail } from "@/lib/effect/action";
import { canTransition } from "@/core/workflow";
import { assignDocumentNumber } from "@/core/numbering";
import type { LockOwner } from "@/core/locks/policy";
import { logisticsStockPort } from "@/modules/logistics/services/logistics.service";
import {
  purchasing, purchasingOrderLines, purchasingOrderRevisions, purchasingReceiptLines, purchasingReceipts, purchasingSuppliers,
} from "../schema";
import { purchasingLock } from "../locks";
import { assignsNumber, isEditable, isReceivable, purchaseOrderWorkflow, RECEIPT_DRIVEN_STATUSES, type PurchaseOrderStatus } from "../domain/workflow";
import { validatePurchaseOrder, validateSupplier, type PurchaseOrderLineInput } from "../domain/order";
import { planReceipt, type ReceiptLineInput } from "../domain/receipt";
import { DEFAULT_GOODS_RECEIPT_NUMBERING, DEFAULT_PURCHASE_ORDER_NUMBERING, GOODS_RECEIPT_NUMBERING_KEY, PURCHASE_ORDER_NUMBERING_KEY } from "../domain/numbering";
import type { InvalidPurchaseOrderError, InvalidReceiptError, InvalidSupplierError } from "../domain/errors";

export type PurchaseOrderRow = typeof purchasing.$inferSelect;
export type SupplierRow = typeof purchasingSuppliers.$inferSelect;
export type ReceiptRow = typeof purchasingReceipts.$inferSelect;
type Executor = ReturnType<typeof getDrizzle> | DbTransaction;

type DomainError = InvalidSupplierError | InvalidPurchaseOrderError | InvalidReceiptError;
const domain = <A>(effect: Effect.Effect<A, DomainError>) => Effect.catch(effect, (error: DomainError) => fail("BAD_REQUEST", error.message));

const sameTenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));

export const purchasingToday = () => new Date().toISOString().slice(0, 10);

const slugify = (title: string) =>
  title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "commande";

const numberFor = (tx: DbTransaction, organizationId: string | null, key: string, scheme: typeof DEFAULT_PURCHASE_ORDER_NUMBERING, today?: string) =>
  assignDocumentNumber(tx, { organizationId, key, scheme, date: today ?? purchasingToday() }).pipe(
    Effect.map(({ number }) => number),
    Effect.catch((error) => fail("BAD_REQUEST", error.message)),
  );

const findOrder = (executor: Executor, id: string, forUpdate = false) =>
  dbTry("purchasing.findById", () => {
    const query = executor.select().from(purchasing).where(eq(purchasing.id, id)).limit(1);
    return forUpdate ? query.for("update") : query;
  }).pipe(Effect.flatMap((rows) => (rows[0] ? Effect.succeed(rows[0]) : fail("NOT_FOUND", "Commande fournisseur introuvable."))));

const orderLines = (executor: Executor, orderId: string) =>
  dbTry("purchasing.lines", () => executor.select().from(purchasingOrderLines).where(eq(purchasingOrderLines.orderId, orderId)).orderBy(asc(purchasingOrderLines.position)));

const revision = (executor: Executor, row: PurchaseOrderRow, authorId: string, note: string) =>
  dbTry("purchasing.revision", () => executor.insert(purchasingOrderRevisions).values({ resourceId: row.id, authorId, title: row.title, slug: row.slug, status: row.status, note }));

export interface SupplierInput {
  readonly code: string;
  readonly name: string;
  readonly email?: string | null;
  readonly country?: string | null;
  readonly vatNumber?: string | null;
  readonly address?: string | null;
  readonly paymentTermDays?: number;
  readonly active?: boolean;
}

const supplierColumns = (executor: Executor, input: SupplierInput, organizationId: string | null, exceptId?: string) =>
  Effect.gen(function* () {
    const valid = yield* domain(validateSupplier({
      code: input.code, name: input.name, email: input.email ?? null, country: input.country ?? null, paymentTermDays: input.paymentTermDays ?? 30,
    }));
    const clash = yield* dbTry("purchasing.supplier.dedup", () =>
      executor.select({ id: purchasingSuppliers.id }).from(purchasingSuppliers)
        .where(and(eq(purchasingSuppliers.code, valid.code), sameTenant(purchasingSuppliers.organizationId, organizationId), exceptId ? ne(purchasingSuppliers.id, exceptId) : undefined)).limit(1));
    if (clash[0]) return yield* fail("CONFLICT", `Le code fournisseur ${valid.code} existe déjà.`);
    return { ...valid, vatNumber: input.vatNumber?.trim() || null, address: input.address?.trim() || null, active: input.active ?? true };
  });

export interface PurchaseOrderInput {
  readonly title?: string | null;
  readonly supplierId: string;
  readonly warehouseId: string;
  readonly currency: string;
  readonly expectedDate?: string | null;
  readonly notes?: string | null;
  readonly lines: readonly PurchaseOrderLineInput[];
}

/** Valide la commande, le fournisseur (actif, même tenant), l'entrepôt et résout chaque SKU. */
const orderColumns = (tx: DbTransaction, input: PurchaseOrderInput, organizationId: string | null) =>
  Effect.gen(function* () {
    const valid = yield* domain(validatePurchaseOrder({ currency: input.currency, expectedDate: input.expectedDate ?? null, lines: input.lines }));
    const [supplier] = yield* dbTry("purchasing.supplier.find", () =>
      tx.select().from(purchasingSuppliers).where(and(eq(purchasingSuppliers.id, input.supplierId), sameTenant(purchasingSuppliers.organizationId, organizationId))).limit(1));
    if (!supplier) return yield* fail("NOT_FOUND", "Fournisseur introuvable.");
    if (!supplier.active) return yield* fail("BAD_REQUEST", "Fournisseur inactif.");
    yield* logisticsStockPort.lockWarehouse(tx, input.warehouseId, organizationId);
    const lines = yield* Effect.forEach(valid.lines, (line) =>
      logisticsStockPort.findItemBySku(tx, line.sku, organizationId).pipe(Effect.map((item) => ({ ...line, itemId: item.id }))));
    const title = input.title?.trim() || `${supplier.name} — ${valid.lines.length} ligne(s)`;
    return {
      columns: {
        title: title.slice(0, 200), supplierId: supplier.id, warehouseId: input.warehouseId, currency: valid.currency,
        expectedDate: valid.expectedDate, netMinor: valid.netMinor, notes: input.notes?.trim() || null,
      },
      lines,
    };
  });

const writeLines = (tx: DbTransaction, orderId: string, lines: readonly { position: number; sku: string; description: string | null; quantity: number; unitPriceMinor: number; netMinor: number; itemId: string }[]) =>
  Effect.gen(function* () {
    yield* dbTry("purchasing.lines.clear", () => tx.delete(purchasingOrderLines).where(eq(purchasingOrderLines.orderId, orderId)));
    yield* dbTry("purchasing.lines.insert", () => tx.insert(purchasingOrderLines).values(lines.map((line) => ({ ...line, orderId }))));
  });

export interface ReceiptInput {
  readonly lines: readonly ReceiptLineInput[];
  readonly supplierReference?: string | null;
  readonly notes?: string | null;
}

export const purchasingService = {
  // ── Fournisseurs ────────────────────────────────────────────────────────
  createSupplier: (input: SupplierInput & { readonly organizationId: string | null }) =>
    dbTransaction("purchasing.supplier.create", (tx) =>
      Effect.gen(function* () {
        const columns = yield* supplierColumns(tx, input, input.organizationId);
        const [row] = yield* dbTry("purchasing.supplier.create", () => tx.insert(purchasingSuppliers).values({ ...columns, organizationId: input.organizationId }).returning());
        return row!;
      })),

  updateSupplier: (id: string, input: SupplierInput) =>
    dbTransaction("purchasing.supplier.update", (tx) =>
      Effect.gen(function* () {
        const [current] = yield* dbTry("purchasing.supplier.find", () => tx.select().from(purchasingSuppliers).where(eq(purchasingSuppliers.id, id)).limit(1).for("update"));
        if (!current) return yield* fail("NOT_FOUND", "Fournisseur introuvable.");
        const columns = yield* supplierColumns(tx, input, current.organizationId, id);
        const [row] = yield* dbTry("purchasing.supplier.update", () => tx.update(purchasingSuppliers).set(columns).where(eq(purchasingSuppliers.id, id)).returning());
        return row!;
      })),

  /** Suppression refusée si le fournisseur a des commandes (le désactiver à la place). */
  deleteSupplier: (id: string) =>
    dbTransaction("purchasing.supplier.delete", (tx) =>
      Effect.gen(function* () {
        const used = yield* dbTry("purchasing.supplier.used", () => tx.select({ id: purchasing.id }).from(purchasing).where(eq(purchasing.supplierId, id)).limit(1));
        if (used[0]) return yield* fail("CONFLICT", "Fournisseur utilisé : désactivez-le plutôt que de le supprimer.");
        const rows = yield* dbTry("purchasing.supplier.delete", () => tx.delete(purchasingSuppliers).where(eq(purchasingSuppliers.id, id)).returning({ id: purchasingSuppliers.id }));
        return rows[0] ? { id } : yield* fail("NOT_FOUND", "Fournisseur introuvable.");
      })),

  // ── Commandes ───────────────────────────────────────────────────────────
  createOrder: (input: PurchaseOrderInput & { readonly organizationId: string | null }, authorId: string) =>
    dbTransaction("purchasing.order.create", (tx) =>
      Effect.gen(function* () {
        const { columns, lines } = yield* orderColumns(tx, input, input.organizationId);
        const slug = `${slugify(columns.title)}-${crypto.randomUUID().slice(0, 8)}`;
        const [row] = yield* dbTry("purchasing.order.create", () => tx.insert(purchasing).values({ ...columns, slug, organizationId: input.organizationId, createdBy: authorId }).returning());
        yield* writeLines(tx, row!.id, lines);
        yield* revision(tx, row!, authorId, "Création");
        return row!;
      })),

  /** Modification complète (en-tête + lignes) : brouillon uniquement. */
  updateOrder: (id: string, input: PurchaseOrderInput, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* purchasingLock.ensureNotLockedByOther(id, owner, locale);
      return yield* dbTransaction("purchasing.order.update", (tx) =>
        Effect.gen(function* () {
          const current = yield* findOrder(tx, id, true);
          if (!isEditable(current.status)) return yield* fail("BAD_REQUEST", "Commande non modifiable : repasser en brouillon d'abord.");
          const { columns, lines } = yield* orderColumns(tx, input, current.organizationId);
          const [row] = yield* dbTry("purchasing.order.update", () => tx.update(purchasing).set(columns).where(eq(purchasing.id, id)).returning());
          yield* writeLines(tx, id, lines);
          yield* revision(tx, row!, owner.userId, "Mise à jour");
          return row!;
        }));
    }),

  /** Transition manuelle (envoi, retour en brouillon, annulation, solde) ; numéro BC à l'envoi. */
  transition: (id: string, to: PurchaseOrderStatus, owner: LockOwner, options: { readonly locale?: string; readonly today?: string } = {}) =>
    Effect.gen(function* () {
      if (RECEIPT_DRIVEN_STATUSES.includes(to)) return yield* fail("BAD_REQUEST", `Statut ${to} posé par les réceptions uniquement.`);
      yield* purchasingLock.ensureNotLockedByOther(id, owner, options.locale);
      return yield* dbTransaction("purchasing.transition", (tx) =>
        Effect.gen(function* () {
          const current = yield* findOrder(tx, id, true);
          if (!canTransition(purchaseOrderWorkflow, current.status, to)) return yield* fail("BAD_REQUEST", `Transition invalide : ${current.status} → ${to}.`);
          const patch: Partial<typeof purchasing.$inferInsert> = { status: to };
          if (assignsNumber(current.status, to)) {
            if (!current.number) patch.number = yield* numberFor(tx, current.organizationId, PURCHASE_ORDER_NUMBERING_KEY, DEFAULT_PURCHASE_ORDER_NUMBERING, options.today);
            patch.sentAt = new Date();
          }
          const [row] = yield* dbTry("purchasing.transition", () => tx.update(purchasing).set(patch).where(eq(purchasing.id, id)).returning());
          yield* revision(tx, row!, owner.userId, `Statut ${current.status} → ${to}`);
          return row!;
        }));
    }),

  /**
   * Réception de marchandises : bon BR numéroté, contrôle du reliquat, une entrée de stock par
   * ligne (référence = numéro BR), cumuls reçus et statut de la commande mis à jour.
   */
  receive: (id: string, input: ReceiptInput, owner: LockOwner, options: { readonly locale?: string; readonly today?: string } = {}) =>
    Effect.gen(function* () {
      yield* purchasingLock.ensureNotLockedByOther(id, owner, options.locale);
      return yield* dbTransaction("purchasing.receive", (tx) =>
        Effect.gen(function* () {
          const order = yield* findOrder(tx, id, true);
          if (!isReceivable(order.status)) return yield* fail("BAD_REQUEST", "Commande non réceptionnable : envoyez-la d'abord.");
          const lines = yield* orderLines(tx, id);
          const plan = yield* domain(planReceipt(lines, input.lines));
          yield* logisticsStockPort.lockWarehouse(tx, order.warehouseId, order.organizationId);
          const number = yield* numberFor(tx, order.organizationId, GOODS_RECEIPT_NUMBERING_KEY, DEFAULT_GOODS_RECEIPT_NUMBERING, options.today);
          const [receipt] = yield* dbTry("purchasing.receipt.create", () => tx.insert(purchasingReceipts).values({
            organizationId: order.organizationId, orderId: id, number, warehouseId: order.warehouseId,
            supplierReference: input.supplierReference?.trim() || null, notes: input.notes?.trim() || null, createdBy: owner.userId,
          }).returning());
          const byId = new Map(lines.map((l) => [l.id, l]));
          for (const entry of plan.lines) {
            const line = byId.get(entry.lineId)!;
            const item = yield* logisticsStockPort.findItemBySku(tx, line.sku, order.organizationId);
            const movement = yield* logisticsStockPort.receive(tx, { organizationId: order.organizationId, warehouseId: order.warehouseId, item, quantity: entry.quantity, reference: number }, owner.userId);
            yield* dbTry("purchasing.receipt.line", () => tx.insert(purchasingReceiptLines).values({ receiptId: receipt!.id, orderLineId: line.id, itemId: item.id, sku: line.sku, quantity: entry.quantity, movementId: movement.id }));
            yield* dbTry("purchasing.line.received", () => tx.update(purchasingOrderLines).set({ receivedQuantity: plan.received.get(line.id)! }).where(eq(purchasingOrderLines.id, line.id)));
          }
          const [row] = yield* dbTry("purchasing.receive.status", () => tx.update(purchasing).set({ status: plan.status }).where(eq(purchasing.id, id)).returning());
          yield* revision(tx, row!, owner.userId, `Réception ${number}`);
          return { order: row!, receipt: receipt! };
        }));
    }),

  /** Suppression : brouillon ou annulée sans réception. */
  deleteOrder: (id: string, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* purchasingLock.ensureNotLockedByOther(id, owner, locale);
      return yield* dbTransaction("purchasing.order.delete", (tx) =>
        Effect.gen(function* () {
          const current = yield* findOrder(tx, id, true);
          if (current.status !== "DRAFT" && current.status !== "CANCELLED") return yield* fail("BAD_REQUEST", "Seule une commande brouillon ou annulée peut être supprimée.");
          const received = yield* dbTry("purchasing.order.receipts", () => tx.select({ id: purchasingReceipts.id }).from(purchasingReceipts).where(eq(purchasingReceipts.orderId, id)).limit(1));
          if (received[0]) return yield* fail("CONFLICT", "Commande réceptionnée : suppression impossible.");
          yield* dbTry("purchasing.order.delete", () => tx.delete(purchasing).where(eq(purchasing.id, id)));
          return { id };
        }));
    }),

  findByIds: (ids: readonly string[]) =>
    ids.length === 0 ? Effect.succeed([] as PurchaseOrderRow[]) : dbTry("purchasing.findByIds", () => getDrizzle().select().from(purchasing).where(inArray(purchasing.id, [...ids]))),

  lock: (id: string, owner: LockOwner, options: { takeOver?: boolean; locale?: string } = {}) => purchasingLock.acquire(id, owner, options),
  unlock: (id: string, owner: LockOwner) => purchasingLock.release(id, owner),
};
