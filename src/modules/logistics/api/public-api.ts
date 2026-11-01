/**
 * API publique du module Logistique (lecture seule, `stock:read`) : articles
 * stockés et leurs niveaux par entrepôt (en stock, réservé, disponible).
 * Aucune écriture : les mouvements restent un journal interne.
 */
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import type { ApiObjectSchema, ApiResourceDefinition, ModuleApiDeclaration } from "@/core/api/contract";
import { iso, tableReader } from "@/core/api/table";
import { dbTry } from "@/lib/effect/run";
import { logisticsItems, logisticsStockMovements, logisticsStockReservations, logisticsWarehouses } from "../schema";

type ItemRow = typeof logisticsItems.$inferSelect;

export interface WarehouseLevel {
  readonly warehouseId: string;
  readonly warehouseCode: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly available: number;
}

/** Niveaux (somme des mouvements) et réservations actives des articles donnés. */
export const levelsForItems = (itemIds: readonly string[], now: Date = new Date()) =>
  Effect.gen(function* () {
    if (itemIds.length === 0) return new Map<string, WarehouseLevel[]>();
    const ids = [...itemIds];
    const [levels, reserved] = yield* Effect.all([
      dbTry("api.stock.levels", () =>
        getDrizzle()
          .select({ itemId: logisticsStockMovements.itemId, warehouseId: logisticsStockMovements.warehouseId, code: logisticsWarehouses.code, level: sql<number>`sum(${logisticsStockMovements.delta})::int` })
          .from(logisticsStockMovements)
          .innerJoin(logisticsWarehouses, eq(logisticsWarehouses.id, logisticsStockMovements.warehouseId))
          .where(inArray(logisticsStockMovements.itemId, ids))
          .groupBy(logisticsStockMovements.itemId, logisticsStockMovements.warehouseId, logisticsWarehouses.code)),
      dbTry("api.stock.reserved", () =>
        getDrizzle()
          .select({ itemId: logisticsStockReservations.itemId, warehouseId: logisticsStockReservations.warehouseId, qty: sql<number>`sum(${logisticsStockReservations.quantity})::int` })
          .from(logisticsStockReservations)
          .where(and(inArray(logisticsStockReservations.itemId, ids), eq(logisticsStockReservations.status, "active"), gt(logisticsStockReservations.expiresAt, now)))
          .groupBy(logisticsStockReservations.itemId, logisticsStockReservations.warehouseId)),
    ]);
    const reservedOf = new Map(reserved.map((r) => [`${r.itemId}:${r.warehouseId}`, Number(r.qty)]));
    const out = new Map<string, WarehouseLevel[]>();
    for (const l of levels) {
      const onHand = Number(l.level);
      const held = reservedOf.get(`${l.itemId}:${l.warehouseId}`) ?? 0;
      const list = out.get(l.itemId) ?? [];
      list.push({ warehouseId: l.warehouseId, warehouseCode: l.code, onHand, reserved: held, available: onHand - held });
      out.set(l.itemId, list);
    }
    for (const list of out.values()) list.sort((a, b) => a.warehouseCode.localeCompare(b.warehouseCode));
    return out;
  });

export const serializeStockItem = (r: ItemRow, levels: readonly WarehouseLevel[]) => ({
  id: r.id,
  sku: r.sku,
  name: r.name,
  variantId: r.variantId,
  lowStockThreshold: r.lowStockThreshold,
  warehouses: levels,
  onHand: levels.reduce((s, l) => s + l.onHand, 0),
  available: levels.reduce((s, l) => s + l.available, 0),
  createdAt: r.createdAt.toISOString(),
  updatedAt: iso(r.updatedAt),
});

const reader = tableReader<ItemRow, ItemRow>(
  {
    name: "stock-levels",
    columns: { id: logisticsItems.id, createdAt: logisticsItems.createdAt, organizationId: logisticsItems.organizationId },
    select: (where, limit) => getDrizzle().select().from(logisticsItems).where(where).orderBy(desc(logisticsItems.createdAt), desc(logisticsItems.id)).limit(limit),
    filters: [
      { name: "sku", description: "SKU exact.", where: (v) => eq(logisticsItems.sku, v) },
      { name: "variantId", description: "Variante boutique liée.", where: (v) => eq(logisticsItems.variantId, v) },
    ],
  },
  (row) => row,
);

const withLevels = (rows: readonly ItemRow[]) =>
  levelsForItems(rows.map((r) => r.id)).pipe(Effect.map((levels) => rows.map((r) => serializeStockItem(r, levels.get(r.id) ?? []))));

const schema: ApiObjectSchema = {
  properties: {
    id: { type: "string" },
    sku: { type: "string" },
    name: { type: "string" },
    variantId: { type: "string", nullable: true },
    lowStockThreshold: { type: "integer", nullable: true, description: "Seuil d'alerte stock.low (null = aucune alerte)." },
    warehouses: { type: "array", description: "warehouseId, warehouseCode, onHand, reserved, available.", items: { type: "object" } },
    onHand: { type: "integer", description: "Total en stock, tous entrepôts." },
    available: { type: "integer", description: "Total disponible (en stock − réservé)." },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time", nullable: true },
  },
  required: ["id", "sku", "name", "warehouses", "onHand", "available", "createdAt"],
};

export const stockLevelsResource: ApiResourceDefinition<unknown> = {
  name: "stock-levels",
  module: "logistics",
  description: "Articles stockés et niveaux par entrepôt.",
  scope: "stock:read",
  filters: reader.filters,
  schema,
  list: (tenant, query) => reader.list(tenant, query).pipe(Effect.flatMap((page) => withLevels(page.items).pipe(Effect.map((items) => ({ items, last: page.last }))))),
  get: (tenant, id) => reader.find(tenant, id).pipe(Effect.flatMap((row) => (row ? withLevels([row]).pipe(Effect.map((items) => items[0])) : Effect.succeed(undefined)))),
};

export const logisticsApi: ModuleApiDeclaration = {
  module: "logistics",
  resources: [stockLevelsResource],
  events: [{ name: "stock.low", description: "Disponible d'un article passé sous son seuil d'alerte dans un entrepôt." }],
};
