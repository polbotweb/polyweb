/**
 * Alerte `stock.low` : publiée (outbox, même transaction) quand le stock physique total d'un
 * article — tous entrepôts, somme du grand livre — franchit son seuil `lowStockThreshold`
 * à la baisse (strictement au-dessus → au plus égal). Pas de nouvel événement tant que le
 * stock reste sous le seuil ; une remontée au-dessus réarme l'alerte. Seuil `null` = aucune alerte.
 * Le stock physique (et non le disponible) est la mesure : la consommation d'une réservation
 * par une sortie ne doit pas produire de fausse alerte.
 */
import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { recordEvent } from "@/core/events/outbox";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";
import { logisticsItems, logisticsStockMovements } from "../schema";

/** Franchissement à la baisse : `before > threshold >= after`. */
export const crossesLowStock = (threshold: number | null, before: number, after: number): boolean =>
  threshold !== null && before > threshold && after <= threshold;

/** À appeler après l'écriture d'un mouvement de `delta` sur `itemId` (dans la transaction). */
export const checkLowStock = (tx: DbTransaction, itemId: string, delta: number, warehouseId: string) =>
  Effect.gen(function* () {
    if (delta >= 0) return false;
    const [item] = yield* dbTry("logistics.lowStock.item", () => tx.select().from(logisticsItems).where(eq(logisticsItems.id, itemId)).limit(1));
    if (!item || item.lowStockThreshold === null) return false;
    const [total] = yield* dbTry("logistics.lowStock.onHand", () =>
      tx.select({ onHand: sql<number>`coalesce(sum(${logisticsStockMovements.delta}), 0)::int` }).from(logisticsStockMovements).where(eq(logisticsStockMovements.itemId, itemId)));
    const after = Number(total?.onHand ?? 0);
    if (!crossesLowStock(item.lowStockThreshold, after - delta, after)) return false;
    yield* recordEvent(tx, "stock.low", {
      id: item.id, sku: item.sku, name: item.name, variantId: item.variantId, threshold: item.lowStockThreshold, onHand: after, warehouseId,
    }, { organizationId: item.organizationId ?? null });
    return true;
  });
