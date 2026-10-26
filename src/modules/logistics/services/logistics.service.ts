/**
 * Service Effect du domaine logistics : entrepôts, articles (SKU unique par tenant), journal de
 * stock (niveau = somme signée des mouvements), transferts, expéditions (lignes, cycle
 * core/workflow, numéro de BL core/numbering à READY, sortie de stock à SHIPPED, rentrée à
 * RETURNED). Toute écriture de stock verrouille la ligne d'entrepôt (`FOR UPDATE`) dans la
 * transaction : deux sorties concurrentes ne peuvent pas rendre le stock négatif.
 * Erreurs de domaine → BAD_REQUEST ; une référence d'un autre tenant → NOT_FOUND (sans fuite).
 */
import { Effect } from "effect";
import { and, asc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { fail } from "@/lib/effect/action";
import { canTransition } from "@/core/workflow";
import { assignDocumentNumber } from "@/core/numbering";
import type { LockOwner } from "@/core/locks/policy";
import { sales } from "@/modules/sales/schema";
import { productVariants } from "@/modules/shop/schema";
import {
  logistics, logisticsItems, logisticsShipmentLines, logisticsShipmentRevisions, logisticsStockMovements, logisticsWarehouses,
} from "../schema";
import { logisticsLock } from "../locks";
import { assignsNumber, isEditable, shipmentWorkflow, stockEffect, type ShipmentStatus } from "../domain/workflow";
import { aggregateBySku, ensureAvailable, MANUAL_MOVEMENT_KINDS, signedQuantity, validateSku } from "../domain/stock";
import { validateShipment, validateWarehouse, type ShipmentLineInput } from "../domain/shipment";
import { DEFAULT_SHIPMENT_NUMBERING, SHIPMENT_NUMBERING_KEY } from "../domain/numbering";
import type { InsufficientStockError, InvalidMovementError, InvalidShipmentError, InvalidWarehouseError } from "../domain/errors";

export type ShipmentRow = typeof logistics.$inferSelect;
export type WarehouseRow = typeof logisticsWarehouses.$inferSelect;
export type ItemRow = typeof logisticsItems.$inferSelect;
export type MovementRow = typeof logisticsStockMovements.$inferSelect;
type Executor = ReturnType<typeof getDrizzle> | DbTransaction;

type DomainError = InvalidWarehouseError | InvalidShipmentError | InvalidMovementError | InsufficientStockError;
const domain = <A>(effect: Effect.Effect<A, DomainError>) => Effect.catch(effect, (error: DomainError) => fail("BAD_REQUEST", error.message));

const sameTenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));

export const logisticsToday = () => new Date().toISOString().slice(0, 10);

const slugify = (title: string) =>
  title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "expedition";

/** Entrepôt du tenant, verrouillé (`FOR UPDATE`) pour sérialiser les écritures de stock. */
const lockWarehouse = (executor: Executor, id: string, organizationId: string | null) =>
  dbTry("logistics.warehouse.lock", () =>
    executor.select().from(logisticsWarehouses).where(and(eq(logisticsWarehouses.id, id), sameTenant(logisticsWarehouses.organizationId, organizationId))).limit(1).for("update"),
  ).pipe(Effect.flatMap((rows) => (rows[0] ? Effect.succeed(rows[0]) : fail("NOT_FOUND", "Entrepôt introuvable."))));

const findItemBySku = (executor: Executor, sku: string, organizationId: string | null) =>
  dbTry("logistics.item.bySku", () =>
    executor.select().from(logisticsItems).where(and(eq(logisticsItems.sku, sku), sameTenant(logisticsItems.organizationId, organizationId))).limit(1),
  ).pipe(Effect.flatMap((rows) => (rows[0] ? Effect.succeed(rows[0]) : fail("NOT_FOUND", `Article ${sku} introuvable.`))));

/** Niveau courant d'un article dans un entrepôt (somme des deltas). */
const levelOf = (executor: Executor, warehouseId: string, itemId: string) =>
  dbTry("logistics.stock.level", () =>
    executor.select({ level: sql<number>`coalesce(sum(${logisticsStockMovements.delta}), 0)::int` }).from(logisticsStockMovements)
      .where(and(eq(logisticsStockMovements.warehouseId, warehouseId), eq(logisticsStockMovements.itemId, itemId))),
  ).pipe(Effect.map((rows) => Number(rows[0]?.level ?? 0)));

interface MovementWrite {
  readonly organizationId: string | null;
  readonly warehouseId: string;
  readonly item: ItemRow;
  readonly kind: string;
  readonly quantity: number;
  readonly shipmentId?: string | null;
  readonly reference?: string | null;
}

/** Écrit un mouvement (entrepôt déjà verrouillé par l'appelant) ; refuse un stock négatif. */
const writeMovement = (executor: Executor, input: MovementWrite, authorId: string) =>
  Effect.gen(function* () {
    const { kind, delta } = yield* domain(signedQuantity(input.kind, input.quantity));
    if (delta < 0) {
      const available = yield* levelOf(executor, input.warehouseId, input.item.id);
      yield* domain(ensureAvailable(input.item.sku, available, delta));
    }
    const [row] = yield* dbTry("logistics.movement.insert", () =>
      executor.insert(logisticsStockMovements).values({
        organizationId: input.organizationId, warehouseId: input.warehouseId, itemId: input.item.id, kind, delta,
        shipmentId: input.shipmentId ?? null, reference: input.reference?.trim() || null, createdBy: authorId,
      }).returning());
    return row!;
  });

const findShipment = (executor: Executor, id: string, forUpdate = false) =>
  dbTry("logistics.findById", () => {
    const query = executor.select().from(logistics).where(eq(logistics.id, id)).limit(1);
    return forUpdate ? query.for("update") : query;
  }).pipe(Effect.flatMap((rows) => (rows[0] ? Effect.succeed(rows[0]) : fail("NOT_FOUND", "Expédition introuvable."))));

const shipmentLines = (executor: Executor, shipmentId: string) =>
  dbTry("logistics.lines", () => executor.select().from(logisticsShipmentLines).where(eq(logisticsShipmentLines.shipmentId, shipmentId)).orderBy(asc(logisticsShipmentLines.position)));

const revision = (executor: Executor, row: ShipmentRow, authorId: string, note: string) =>
  dbTry("logistics.revision", () => executor.insert(logisticsShipmentRevisions).values({ resourceId: row.id, authorId, title: row.title, slug: row.slug, status: row.status, note }));

export interface WarehouseInput {
  readonly code: string;
  readonly name: string;
  readonly country?: string | null;
  readonly address?: string | null;
  readonly active?: boolean;
}

const warehouseColumns = (executor: Executor, input: WarehouseInput, organizationId: string | null, exceptId?: string) =>
  Effect.gen(function* () {
    const valid = yield* domain(validateWarehouse({ code: input.code, name: input.name, country: input.country ?? null }));
    const clash = yield* dbTry("logistics.warehouse.dedup", () =>
      executor.select({ id: logisticsWarehouses.id }).from(logisticsWarehouses)
        .where(and(eq(logisticsWarehouses.code, valid.code), sameTenant(logisticsWarehouses.organizationId, organizationId), exceptId ? ne(logisticsWarehouses.id, exceptId) : undefined)).limit(1));
    if (clash[0]) return yield* fail("CONFLICT", `Le code d'entrepôt ${valid.code} existe déjà.`);
    return { ...valid, address: input.address?.trim() || null, active: input.active ?? true };
  });

export interface ItemInput {
  readonly sku: string;
  readonly name: string;
  readonly variantId?: string | null;
}

const itemColumns = (executor: Executor, input: ItemInput, organizationId: string | null, exceptId?: string) =>
  Effect.gen(function* () {
    const sku = yield* domain(validateSku(input.sku));
    const name = input.name.trim();
    if (name === "" || name.length > 200) return yield* fail("BAD_REQUEST", "Nom d'article requis (200 caractères max).");
    const clash = yield* dbTry("logistics.item.dedup", () =>
      executor.select({ id: logisticsItems.id }).from(logisticsItems)
        .where(and(eq(logisticsItems.sku, sku), sameTenant(logisticsItems.organizationId, organizationId), exceptId ? ne(logisticsItems.id, exceptId) : undefined)).limit(1));
    if (clash[0]) return yield* fail("CONFLICT", `Le SKU ${sku} existe déjà.`);
    const variantId = input.variantId?.trim() || null;
    if (variantId) {
      const found = yield* dbTry("logistics.item.variant", () => executor.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1));
      if (!found[0]) return yield* fail("NOT_FOUND", "Variante introuvable.");
    }
    return { sku, name, variantId };
  });

export interface ShipmentInput {
  readonly title?: string | null;
  readonly warehouseId: string;
  readonly salesDocumentId?: string | null;
  readonly recipientName: string;
  readonly address?: string | null;
  readonly country: string;
  readonly carrier?: string | null;
  readonly trackingNumber?: string | null;
  readonly weightGrams?: number | null;
  readonly notes?: string | null;
  readonly lines: readonly ShipmentLineInput[];
}

/** Valide l'expédition et résout chaque SKU en article du tenant. */
const shipmentColumns = (executor: Executor, input: ShipmentInput, organizationId: string | null) =>
  Effect.gen(function* () {
    const valid = yield* domain(validateShipment({
      recipientName: input.recipientName, country: input.country, weightGrams: input.weightGrams ?? null,
      trackingNumber: input.trackingNumber ?? null, lines: input.lines,
    }));
    yield* lockWarehouse(executor, input.warehouseId, organizationId);
    const salesDocumentId = input.salesDocumentId?.trim() || null;
    if (salesDocumentId) {
      const found = yield* dbTry("logistics.sales", () =>
        executor.select({ id: sales.id }).from(sales).where(and(eq(sales.id, salesDocumentId), sameTenant(sales.organizationId, organizationId))).limit(1));
      if (!found[0]) return yield* fail("NOT_FOUND", "Document de vente introuvable.");
    }
    const lines = yield* Effect.forEach(valid.lines, (line) =>
      findItemBySku(executor, line.sku, organizationId).pipe(Effect.map((item) => ({ ...line, itemId: item.id }))));
    const title = input.title?.trim() || `${valid.recipientName} (${valid.country})`;
    return {
      columns: {
        title, warehouseId: input.warehouseId, salesDocumentId, recipientName: valid.recipientName, address: input.address?.trim() || null,
        country: valid.country, carrier: input.carrier?.trim() || null, trackingNumber: valid.trackingNumber, weightGrams: valid.weightGrams,
        notes: input.notes?.trim() || null,
      },
      lines,
    };
  });

const writeLines = (executor: Executor, shipmentId: string, lines: readonly { position: number; sku: string; description: string | null; quantity: number; itemId: string }[]) =>
  Effect.gen(function* () {
    yield* dbTry("logistics.lines.clear", () => executor.delete(logisticsShipmentLines).where(eq(logisticsShipmentLines.shipmentId, shipmentId)));
    yield* dbTry("logistics.lines.insert", () => executor.insert(logisticsShipmentLines).values(lines.map((line) => ({ ...line, shipmentId }))));
  });

/** Mouvements produits par une transition (sortie à SHIPPED, rentrée à RETURNED). */
const applyStockEffect = (tx: DbTransaction, row: ShipmentRow, effect: "issue" | "return", authorId: string) =>
  Effect.gen(function* () {
    yield* lockWarehouse(tx, row.warehouseId, row.organizationId);
    const lines = yield* shipmentLines(tx, row.id);
    const totals = aggregateBySku(lines);
    for (const [sku, quantity] of totals) {
      const item = yield* findItemBySku(tx, sku, row.organizationId);
      yield* writeMovement(tx, {
        organizationId: row.organizationId, warehouseId: row.warehouseId, item, kind: effect === "issue" ? "shipment" : "return",
        quantity, shipmentId: row.id, reference: row.number,
      }, authorId);
    }
  });

export const logisticsService = {
  // ── Entrepôts ───────────────────────────────────────────────────────────
  createWarehouse: (input: WarehouseInput & { readonly organizationId: string | null }) =>
    dbTransaction("logistics.warehouse.create", (tx) =>
      Effect.gen(function* () {
        const columns = yield* warehouseColumns(tx, input, input.organizationId);
        const [row] = yield* dbTry("logistics.warehouse.create", () => tx.insert(logisticsWarehouses).values({ ...columns, organizationId: input.organizationId }).returning());
        return row!;
      })),

  updateWarehouse: (id: string, input: WarehouseInput) =>
    dbTransaction("logistics.warehouse.update", (tx) =>
      Effect.gen(function* () {
        const [current] = yield* dbTry("logistics.warehouse.find", () => tx.select().from(logisticsWarehouses).where(eq(logisticsWarehouses.id, id)).limit(1).for("update"));
        if (!current) return yield* fail("NOT_FOUND", "Entrepôt introuvable.");
        const columns = yield* warehouseColumns(tx, input, current.organizationId, id);
        const [row] = yield* dbTry("logistics.warehouse.update", () => tx.update(logisticsWarehouses).set(columns).where(eq(logisticsWarehouses.id, id)).returning());
        return row!;
      })),

  /** Suppression refusée si l'entrepôt porte des mouvements ou des expéditions (désactiver à la place). */
  deleteWarehouse: (id: string) =>
    dbTransaction("logistics.warehouse.delete", (tx) =>
      Effect.gen(function* () {
        const used = yield* dbTry("logistics.warehouse.used", () =>
          tx.select({ id: logisticsStockMovements.id }).from(logisticsStockMovements).where(eq(logisticsStockMovements.warehouseId, id)).limit(1)
            .union(tx.select({ id: logistics.id }).from(logistics).where(eq(logistics.warehouseId, id)).limit(1)));
        if (used[0]) return yield* fail("CONFLICT", "Entrepôt utilisé : désactivez-le plutôt que de le supprimer.");
        const rows = yield* dbTry("logistics.warehouse.delete", () => tx.delete(logisticsWarehouses).where(eq(logisticsWarehouses.id, id)).returning({ id: logisticsWarehouses.id }));
        return rows[0] ? { id } : yield* fail("NOT_FOUND", "Entrepôt introuvable.");
      })),

  // ── Articles ────────────────────────────────────────────────────────────
  createItem: (input: ItemInput & { readonly organizationId: string | null }) =>
    dbTransaction("logistics.item.create", (tx) =>
      Effect.gen(function* () {
        const columns = yield* itemColumns(tx, input, input.organizationId);
        const [row] = yield* dbTry("logistics.item.create", () => tx.insert(logisticsItems).values({ ...columns, organizationId: input.organizationId }).returning());
        return row!;
      })),

  updateItem: (id: string, input: ItemInput) =>
    dbTransaction("logistics.item.update", (tx) =>
      Effect.gen(function* () {
        const [current] = yield* dbTry("logistics.item.find", () => tx.select().from(logisticsItems).where(eq(logisticsItems.id, id)).limit(1).for("update"));
        if (!current) return yield* fail("NOT_FOUND", "Article introuvable.");
        const columns = yield* itemColumns(tx, input, current.organizationId, id);
        if (columns.sku !== current.sku) {
          const used = yield* dbTry("logistics.item.used", () => tx.select({ id: logisticsStockMovements.id }).from(logisticsStockMovements).where(eq(logisticsStockMovements.itemId, id)).limit(1));
          if (used[0]) return yield* fail("CONFLICT", "SKU figé : l'article a déjà des mouvements de stock.");
        }
        const [row] = yield* dbTry("logistics.item.update", () => tx.update(logisticsItems).set(columns).where(eq(logisticsItems.id, id)).returning());
        return row!;
      })),

  deleteItem: (id: string) =>
    dbTransaction("logistics.item.delete", (tx) =>
      Effect.gen(function* () {
        const used = yield* dbTry("logistics.item.used", () =>
          tx.select({ id: logisticsStockMovements.id }).from(logisticsStockMovements).where(eq(logisticsStockMovements.itemId, id)).limit(1)
            .union(tx.select({ id: logisticsShipmentLines.id }).from(logisticsShipmentLines).where(eq(logisticsShipmentLines.itemId, id)).limit(1)));
        if (used[0]) return yield* fail("CONFLICT", "Article utilisé (stock ou expédition) : suppression impossible.");
        const rows = yield* dbTry("logistics.item.delete", () => tx.delete(logisticsItems).where(eq(logisticsItems.id, id)).returning({ id: logisticsItems.id }));
        return rows[0] ? { id } : yield* fail("NOT_FOUND", "Article introuvable.");
      })),

  // ── Stock ───────────────────────────────────────────────────────────────
  /** Mouvement manuel (réception, sortie, ajustement signé). */
  recordMovement: (
    input: { readonly organizationId: string | null; readonly warehouseId: string; readonly sku: string; readonly kind: string; readonly quantity: number; readonly reference?: string | null },
    authorId: string,
  ) =>
    Effect.gen(function* () {
      if (!(MANUAL_MOVEMENT_KINDS as readonly string[]).includes(input.kind)) return yield* fail("BAD_REQUEST", `Type de mouvement non saisissable : ${input.kind}.`);
      const sku = yield* domain(validateSku(input.sku));
      return yield* dbTransaction("logistics.movement.record", (tx) =>
        Effect.gen(function* () {
          yield* lockWarehouse(tx, input.warehouseId, input.organizationId);
          const item = yield* findItemBySku(tx, sku, input.organizationId);
          return yield* writeMovement(tx, { ...input, item }, authorId);
        }));
    }),

  /** Transfert entre deux entrepôts du tenant : une sortie et une entrée dans la même transaction. */
  transfer: (
    input: { readonly organizationId: string | null; readonly fromWarehouseId: string; readonly toWarehouseId: string; readonly sku: string; readonly quantity: number; readonly reference?: string | null },
    authorId: string,
  ) =>
    Effect.gen(function* () {
      if (input.fromWarehouseId === input.toWarehouseId) return yield* fail("BAD_REQUEST", "Entrepôts source et destination identiques.");
      const sku = yield* domain(validateSku(input.sku));
      return yield* dbTransaction("logistics.transfer", (tx) =>
        Effect.gen(function* () {
          // Ordre de verrouillage stable (id croissant) : pas d'interblocage entre deux transferts croisés.
          for (const id of [input.fromWarehouseId, input.toWarehouseId].sort()) yield* lockWarehouse(tx, id, input.organizationId);
          const item = yield* findItemBySku(tx, sku, input.organizationId);
          const out = yield* writeMovement(tx, { organizationId: input.organizationId, warehouseId: input.fromWarehouseId, item, kind: "transfer_out", quantity: input.quantity, reference: input.reference }, authorId);
          const into = yield* writeMovement(tx, { organizationId: input.organizationId, warehouseId: input.toWarehouseId, item, kind: "transfer_in", quantity: input.quantity, reference: input.reference }, authorId);
          return { out, into };
        }));
    }),

  /** Niveaux de stock du tenant par entrepôt × article (lignes à zéro incluses si l'article a bougé). */
  stockLevels: (organizationId: string | null, warehouseId?: string) =>
    dbTry("logistics.stock.levels", () =>
      getDrizzle().select({
        warehouseId: logisticsStockMovements.warehouseId, itemId: logisticsStockMovements.itemId, sku: logisticsItems.sku, name: logisticsItems.name,
        warehouseCode: logisticsWarehouses.code, level: sql<number>`sum(${logisticsStockMovements.delta})::int`,
      }).from(logisticsStockMovements)
        .innerJoin(logisticsItems, eq(logisticsItems.id, logisticsStockMovements.itemId))
        .innerJoin(logisticsWarehouses, eq(logisticsWarehouses.id, logisticsStockMovements.warehouseId))
        .where(and(sameTenant(logisticsStockMovements.organizationId, organizationId), warehouseId ? eq(logisticsStockMovements.warehouseId, warehouseId) : undefined))
        .groupBy(logisticsStockMovements.warehouseId, logisticsStockMovements.itemId, logisticsItems.sku, logisticsItems.name, logisticsWarehouses.code)
        .orderBy(asc(logisticsWarehouses.code), asc(logisticsItems.sku)),
    ).pipe(Effect.map((rows) => rows.map((row) => ({ ...row, level: Number(row.level) })))),

  // ── Expéditions ─────────────────────────────────────────────────────────
  createShipment: (input: ShipmentInput & { readonly organizationId: string | null }, authorId: string) =>
    dbTransaction("logistics.shipment.create", (tx) =>
      Effect.gen(function* () {
        const { columns, lines } = yield* shipmentColumns(tx, input, input.organizationId);
        const slug = `${slugify(columns.title)}-${crypto.randomUUID().slice(0, 8)}`;
        const [row] = yield* dbTry("logistics.shipment.create", () => tx.insert(logistics).values({ ...columns, slug, organizationId: input.organizationId, createdBy: authorId }).returning());
        yield* writeLines(tx, row!.id, lines);
        yield* revision(tx, row!, authorId, "Création");
        return row!;
      })),

  /** Modification complète (en-tête + lignes) : brouillon uniquement. */
  updateShipment: (id: string, input: ShipmentInput, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* logisticsLock.ensureNotLockedByOther(id, owner, locale);
      return yield* dbTransaction("logistics.shipment.update", (tx) =>
        Effect.gen(function* () {
          const current = yield* findShipment(tx, id, true);
          if (!isEditable(current.status)) return yield* fail("BAD_REQUEST", "Expédition non modifiable : repasser en brouillon d'abord.");
          const { columns, lines } = yield* shipmentColumns(tx, input, current.organizationId);
          const [row] = yield* dbTry("logistics.shipment.update", () => tx.update(logistics).set(columns).where(eq(logistics.id, id)).returning());
          yield* writeLines(tx, id, lines);
          yield* revision(tx, row!, owner.userId, "Mise à jour");
          return row!;
        }));
    }),

  /** Transporteur / numéro de suivi : modifiables tant que l'expédition n'est pas close. */
  updateTracking: (id: string, input: { readonly carrier?: string | null; readonly trackingNumber?: string | null }, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* logisticsLock.ensureNotLockedByOther(id, owner, locale);
      const tracking = input.trackingNumber?.trim() || null;
      if (tracking !== null && !/^[A-Za-z0-9 -]{4,64}$/.test(tracking)) return yield* fail("BAD_REQUEST", `Expédition invalide (tracking) : ${tracking}`);
      return yield* dbTransaction("logistics.shipment.tracking", (tx) =>
        Effect.gen(function* () {
          const current = yield* findShipment(tx, id, true);
          if (current.status === "CANCELLED" || current.status === "RETURNED") return yield* fail("BAD_REQUEST", "Expédition close.");
          const [row] = yield* dbTry("logistics.shipment.tracking", () =>
            tx.update(logistics).set({ carrier: input.carrier?.trim() || null, trackingNumber: tracking }).where(eq(logistics.id, id)).returning());
          yield* revision(tx, row!, owner.userId, "Suivi mis à jour");
          return row!;
        }));
    }),

  /** Changement de statut : table de transitions, numéro à READY, mouvements de stock à SHIPPED / RETURNED. */
  transition: (id: string, to: ShipmentStatus, owner: LockOwner, options: { readonly locale?: string; readonly today?: string } = {}) =>
    Effect.gen(function* () {
      yield* logisticsLock.ensureNotLockedByOther(id, owner, options.locale);
      return yield* dbTransaction("logistics.transition", (tx) =>
        Effect.gen(function* () {
          const current = yield* findShipment(tx, id, true);
          if (!canTransition(shipmentWorkflow, current.status, to)) return yield* fail("BAD_REQUEST", `Transition invalide : ${current.status} → ${to}.`);
          const patch: Partial<typeof logistics.$inferInsert> = { status: to };
          if (assignsNumber(current.status, to) && !current.number) {
            const { number } = yield* assignDocumentNumber(tx, {
              organizationId: current.organizationId, key: SHIPMENT_NUMBERING_KEY, scheme: DEFAULT_SHIPMENT_NUMBERING, date: options.today ?? logisticsToday(),
            }).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
            patch.number = number;
          }
          if (to === "SHIPPED") patch.shippedAt = new Date();
          if (to === "DELIVERED") patch.deliveredAt = new Date();
          const effect = stockEffect(current.status, to);
          if (effect) yield* applyStockEffect(tx, { ...current, number: patch.number ?? current.number }, effect, owner.userId);
          const [row] = yield* dbTry("logistics.transition", () => tx.update(logistics).set(patch).where(eq(logistics.id, id)).returning());
          yield* revision(tx, row!, owner.userId, `Statut ${current.status} → ${to}`);
          return row!;
        }));
    }),

  /** Suppression : brouillon ou annulée uniquement (aucun mouvement de stock rattaché). */
  deleteShipment: (id: string, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* logisticsLock.ensureNotLockedByOther(id, owner, locale);
      return yield* dbTransaction("logistics.shipment.delete", (tx) =>
        Effect.gen(function* () {
          const current = yield* findShipment(tx, id, true);
          if (current.status !== "DRAFT" && current.status !== "CANCELLED") return yield* fail("BAD_REQUEST", "Seule une expédition brouillon ou annulée peut être supprimée.");
          yield* dbTry("logistics.shipment.delete", () => tx.delete(logistics).where(eq(logistics.id, id)));
          return { id };
        }));
    }),

  lines: (shipmentId: string) => shipmentLines(getDrizzle(), shipmentId),
  findByIds: (ids: readonly string[]) =>
    ids.length === 0 ? Effect.succeed([] as ShipmentRow[]) : dbTry("logistics.findByIds", () => getDrizzle().select().from(logistics).where(inArray(logistics.id, [...ids]))),

  lock: (id: string, owner: LockOwner, options: { takeOver?: boolean; locale?: string } = {}) => logisticsLock.acquire(id, owner, options),
  unlock: (id: string, owner: LockOwner) => logisticsLock.release(id, owner),
};
