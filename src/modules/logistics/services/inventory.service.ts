/**
 * Inventaires physiques par entrepôt (cf. `domain/inventory.ts`).
 *
 * Ouverture : l'entrepôt est verrouillé, un numéro `INV-AAAA-NNNNN` attribué (core/numbering) et
 * une ligne créée par article du tenant avec le stock théorique figé (`expected`).
 * Validation : sous le verrou de l'entrepôt (aucun mouvement concurrent), le niveau réel de
 * chaque ligne comptée est relu et un ajustement `delta = compté − niveau` est posté au grand
 * livre (`source = inventory`, lié à l'inventaire) : le stock vaut exactement le compté ensuite.
 * L'ajustement ne tient pas compte des réservations (le comptage physique fait foi).
 */
import { Effect } from "effect";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { fail } from "@/lib/effect/failure";
import { assignDocumentNumber } from "@/core/numbering";
import { logisticsInventoryCountLines, logisticsInventoryCounts, logisticsItems, logisticsStockMovements } from "../schema";
import { countAdjustments, ensureOpen, parseCountedQuantity } from "../domain/inventory";
import { DEFAULT_INVENTORY_NUMBERING, INVENTORY_NUMBERING_KEY } from "../domain/numbering";
import type { InvalidInventoryCountError, InventoryCountStateError } from "../domain/errors";
import { logisticsStockInternals, logisticsToday } from "./logistics.service";

export type InventoryCountRow = typeof logisticsInventoryCounts.$inferSelect;
export type InventoryCountLineRow = typeof logisticsInventoryCountLines.$inferSelect;
type Executor = ReturnType<typeof getDrizzle> | DbTransaction;

const { lockWarehouse, levelsOf, sameTenant } = logisticsStockInternals;
const MAX_NOTE = 1000;

type DomainError = InvalidInventoryCountError | InventoryCountStateError;
const domain = <A>(effect: Effect.Effect<A, DomainError>) => Effect.catch(effect, (error: DomainError) => fail("BAD_REQUEST", error.message));

const findCount = (executor: Executor, id: string, organizationId: string | null, forUpdate = false) =>
  dbTry("logistics.inventory.find", () => {
    const query = executor.select().from(logisticsInventoryCounts)
      .where(and(eq(logisticsInventoryCounts.id, id), sameTenant(logisticsInventoryCounts.organizationId, organizationId))).limit(1);
    return forUpdate ? query.for("update") : query;
  }).pipe(Effect.flatMap((rows) => (rows[0] ? Effect.succeed(rows[0]) : fail("NOT_FOUND", "Inventaire introuvable."))));

/** Verrouille l'entrepôt PUIS l'inventaire (même ordre que toute écriture de stock : pas d'interblocage). */
const lockCount = (tx: DbTransaction, id: string, organizationId: string | null) =>
  Effect.gen(function* () {
    const head = yield* findCount(tx, id, organizationId);
    yield* lockWarehouse(tx, head.warehouseId, organizationId);
    return yield* findCount(tx, id, organizationId, true);
  });

const countLines = (executor: Executor, countId: string) =>
  dbTry("logistics.inventory.lines", () =>
    executor.select().from(logisticsInventoryCountLines).where(eq(logisticsInventoryCountLines.countId, countId)).orderBy(asc(logisticsInventoryCountLines.sku)));

export interface CountEntry {
  readonly lineId: string;
  readonly counted: string | number | null;
}

export const inventoryService = {
  /** Ouvre un inventaire sur un entrepôt du tenant (un seul ouvert à la fois par entrepôt). */
  open: (input: { readonly organizationId: string | null; readonly warehouseId: string; readonly note?: string | null; readonly today?: string }, authorId: string) =>
    Effect.gen(function* () {
      const note = input.note?.trim() || null;
      if (note && note.length > MAX_NOTE) return yield* fail("BAD_REQUEST", `Note trop longue (${MAX_NOTE} caractères max).`);
      return yield* dbTransaction("logistics.inventory.open", (tx) =>
        Effect.gen(function* () {
          const warehouse = yield* lockWarehouse(tx, input.warehouseId, input.organizationId);
          if (!warehouse.active) return yield* fail("BAD_REQUEST", "Entrepôt inactif : inventaire impossible.");
          const [already] = yield* dbTry("logistics.inventory.openOf", () =>
            tx.select({ number: logisticsInventoryCounts.number }).from(logisticsInventoryCounts)
              .where(and(eq(logisticsInventoryCounts.warehouseId, warehouse.id), eq(logisticsInventoryCounts.status, "OPEN"))).limit(1));
          if (already) return yield* fail("CONFLICT", `Un inventaire est déjà ouvert sur cet entrepôt (${already.number}).`);
          const items = yield* dbTry("logistics.inventory.items", () =>
            tx.select({ id: logisticsItems.id, sku: logisticsItems.sku }).from(logisticsItems).where(sameTenant(logisticsItems.organizationId, input.organizationId)).orderBy(asc(logisticsItems.sku)));
          if (items.length === 0) return yield* fail("BAD_REQUEST", "Aucun article à inventorier.");
          const { number } = yield* assignDocumentNumber(tx, {
            organizationId: input.organizationId, key: INVENTORY_NUMBERING_KEY, scheme: DEFAULT_INVENTORY_NUMBERING, date: input.today ?? logisticsToday(),
          }).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
          const levels = yield* levelsOf(tx, warehouse.id);
          const [count] = yield* dbTry("logistics.inventory.insert", () =>
            tx.insert(logisticsInventoryCounts).values({ organizationId: input.organizationId, warehouseId: warehouse.id, number, note, createdBy: authorId }).returning());
          yield* dbTry("logistics.inventory.lines.insert", () =>
            tx.insert(logisticsInventoryCountLines).values(items.map((item) => ({ countId: count!.id, itemId: item.id, sku: item.sku, expected: levels.get(item.id) ?? 0 }))));
          return count!;
        }));
    }),

  /**
   * Enregistre des quantités comptées (vide = remise à « non compté »). Inventaire ouvert
   * uniquement ; chaque ligne doit appartenir à l'inventaire.
   */
  recordCounts: (id: string, organizationId: string | null, entries: readonly CountEntry[], authorId: string) =>
    Effect.gen(function* () {
      if (entries.length === 0) return yield* fail("BAD_REQUEST", "Aucune quantité saisie.");
      if (new Set(entries.map((entry) => entry.lineId)).size !== entries.length) return yield* fail("BAD_REQUEST", "Ligne d'inventaire en double.");
      const parsed = yield* Effect.forEach(entries, (entry) => domain(parseCountedQuantity(entry.counted)).pipe(Effect.map((counted) => ({ lineId: entry.lineId, counted }))));
      return yield* dbTransaction("logistics.inventory.count", (tx) =>
        Effect.gen(function* () {
          const count = yield* findCount(tx, id, organizationId, true);
          yield* domain(ensureOpen(count.status, "count"));
          const known = yield* dbTry("logistics.inventory.lines.ids", () =>
            tx.select({ id: logisticsInventoryCountLines.id }).from(logisticsInventoryCountLines)
              .where(and(eq(logisticsInventoryCountLines.countId, id), inArray(logisticsInventoryCountLines.id, parsed.map((entry) => entry.lineId)))));
          if (known.length !== parsed.length) return yield* fail("NOT_FOUND", "Ligne d'inventaire introuvable.");
          const now = new Date();
          for (const entry of parsed) {
            yield* dbTry("logistics.inventory.line.update", () =>
              tx.update(logisticsInventoryCountLines)
                .set(entry.counted === null ? { counted: null, countedBy: null, countedAt: null } : { counted: entry.counted, countedBy: authorId, countedAt: now })
                .where(and(eq(logisticsInventoryCountLines.id, entry.lineId), eq(logisticsInventoryCountLines.countId, id))));
          }
          yield* dbTry("logistics.inventory.touch", () => tx.update(logisticsInventoryCounts).set({ updatedAt: now }).where(eq(logisticsInventoryCounts.id, id)));
          return { id, updated: parsed.length };
        }));
    }),

  /**
   * Valide l'inventaire : poste les ajustements d'écart des lignes comptées (les lignes non
   * comptées sont ignorées) et fige niveau réel + écart sur chaque ligne.
   */
  validate: (id: string, organizationId: string | null, authorId: string) =>
    dbTransaction("logistics.inventory.validate", (tx) =>
      Effect.gen(function* () {
        const count = yield* lockCount(tx, id, organizationId);
        yield* domain(ensureOpen(count.status, "validate"));
        const lines = yield* countLines(tx, id);
        const levels = yield* levelsOf(tx, count.warehouseId);
        const adjustments = yield* domain(countAdjustments(lines, levels));
        const byItem = new Map(lines.map((line) => [line.itemId, line]));
        let posted = 0;
        for (const adjustment of adjustments) {
          const line = byItem.get(adjustment.itemId)!;
          if (adjustment.variance !== 0) {
            // Garde-fou : le niveau obtenu est le compté (≥ 0), jamais négatif.
            if (adjustment.system + adjustment.variance < 0) return yield* fail("BAD_REQUEST", `Ajustement incohérent pour ${line.sku}.`);
            yield* dbTry("logistics.inventory.adjust", () =>
              tx.insert(logisticsStockMovements).values({
                organizationId: count.organizationId, warehouseId: count.warehouseId, itemId: adjustment.itemId, kind: "adjustment", delta: adjustment.variance,
                source: "inventory", inventoryCountId: count.id, reference: count.number, createdBy: authorId,
              }));
            posted += 1;
          }
          yield* dbTry("logistics.inventory.line.freeze", () =>
            tx.update(logisticsInventoryCountLines).set({ system: adjustment.system, variance: adjustment.variance }).where(eq(logisticsInventoryCountLines.id, line.id)));
        }
        const [row] = yield* dbTry("logistics.inventory.validated", () =>
          tx.update(logisticsInventoryCounts).set({ status: "VALIDATED", validatedBy: authorId, validatedAt: new Date() }).where(eq(logisticsInventoryCounts.id, id)).returning());
        return { count: row!, counted: adjustments.length, adjustments: posted, netVariance: adjustments.reduce((sum, a) => sum + a.variance, 0) };
      })),

  /** Annule un inventaire ouvert (aucun mouvement). */
  cancel: (id: string, organizationId: string | null) =>
    dbTransaction("logistics.inventory.cancel", (tx) =>
      Effect.gen(function* () {
        const count = yield* findCount(tx, id, organizationId, true);
        yield* domain(ensureOpen(count.status, "cancel"));
        const [row] = yield* dbTry("logistics.inventory.cancelled", () =>
          tx.update(logisticsInventoryCounts).set({ status: "CANCELLED", cancelledAt: new Date() }).where(eq(logisticsInventoryCounts.id, id)).returning());
        return row!;
      })),
};
