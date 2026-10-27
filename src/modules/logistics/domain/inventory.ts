/**
 * Inventaires (comptages physiques) par entrepôt : ouverture (photo du stock théorique),
 * saisie des quantités comptées, puis validation qui poste un ajustement par écart
 * (`delta = compté − niveau au moment de la validation`) ou annulation.
 *
 * OPEN → VALIDATED | CANCELLED ; un seul inventaire ouvert par entrepôt.
 */
import { Effect } from "effect";
import { InvalidInventoryCountError, InventoryCountStateError } from "./errors";

export const INVENTORY_COUNT_STATUSES = ["OPEN", "VALIDATED", "CANCELLED"] as const;
export type InventoryCountStatus = (typeof INVENTORY_COUNT_STATUSES)[number];

/** Borne haute d'une quantité comptée (garde-fou de saisie, tient dans un `integer`). */
export const MAX_COUNTED_QUANTITY = 10_000_000;

export const isInventoryCountStatus = (value: string): value is InventoryCountStatus => (INVENTORY_COUNT_STATUSES as readonly string[]).includes(value);

/** Seul un inventaire ouvert peut être compté, validé ou annulé. */
export const ensureOpen = (status: InventoryCountStatus, action: "count" | "validate" | "cancel"): Effect.Effect<void, InventoryCountStateError> =>
  status === "OPEN" ? Effect.void : Effect.fail(new InventoryCountStateError({ status, action }));

/**
 * Quantité comptée saisie : vide = « non compté » (null), sinon entier ≥ 0 borné.
 */
export const parseCountedQuantity = (raw: string | number | null | undefined): Effect.Effect<number | null, InvalidInventoryCountError> => {
  if (raw === null || raw === undefined) return Effect.succeed(null);
  const text = String(raw).trim();
  if (text === "") return Effect.succeed(null);
  if (!/^\d+$/.test(text)) return Effect.fail(new InvalidInventoryCountError({ field: "counted", value: text }));
  const value = Number(text);
  return Number.isSafeInteger(value) && value <= MAX_COUNTED_QUANTITY ? Effect.succeed(value) : Effect.fail(new InvalidInventoryCountError({ field: "counted", value: text }));
};

export interface CountedLine {
  readonly itemId: string;
  readonly counted: number | null;
}

export interface CountAdjustment {
  readonly itemId: string;
  /** Niveau réel au moment de la validation. */
  readonly system: number;
  readonly counted: number;
  /** `counted − system` ; un ajustement n'est posté que s'il est non nul. */
  readonly variance: number;
}

/**
 * Écarts à poster à la validation, à partir des niveaux actuels (`levels`, par article).
 * Les lignes non comptées sont ignorées ; au moins une ligne doit être comptée.
 */
export const countAdjustments = (lines: readonly CountedLine[], levels: ReadonlyMap<string, number>): Effect.Effect<readonly CountAdjustment[], InvalidInventoryCountError> => {
  const counted = lines.filter((line): line is CountedLine & { counted: number } => line.counted !== null);
  if (counted.length === 0) return Effect.fail(new InvalidInventoryCountError({ field: "lines", value: "0" }));
  return Effect.succeed(counted.map((line) => {
    const system = levels.get(line.itemId) ?? 0;
    return { itemId: line.itemId, system, counted: line.counted, variance: line.counted - system };
  }));
};

/** Synthèse d'un inventaire : lignes comptées, écarts non nuls, somme des écarts. */
export const countSummary = (lines: readonly { readonly counted: number | null; readonly variance: number | null }[]) => ({
  total: lines.length,
  counted: lines.filter((line) => line.counted !== null).length,
  discrepancies: lines.filter((line) => line.variance !== null && line.variance !== 0).length,
  netVariance: lines.reduce((sum, line) => sum + (line.variance ?? 0), 0),
});
