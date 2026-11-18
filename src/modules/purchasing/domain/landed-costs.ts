/**
 * Répartition des frais d'approche (fret, assurance, droits) sur les lignes d'une commande.
 * Méthodes : au prorata de la valeur HT, de la quantité, ou du poids.
 */
import { Effect } from "effect";
import { allocate, parseCurrency } from "@/core/money";
import { InvalidPurchaseOrderError } from "./errors";

export const LANDED_COST_CATEGORIES = ["freight", "insurance", "duty", "other"] as const;
export type LandedCostCategory = (typeof LANDED_COST_CATEGORIES)[number];

export const LANDED_COST_METHODS = ["value", "quantity", "weight"] as const;
export type LandedCostMethod = (typeof LANDED_COST_METHODS)[number];

export interface LandedCostLineBasis {
  readonly orderLineId: string;
  readonly netMinor: number;
  readonly quantity: number;
  readonly weightGrams: number | null;
}

export interface LandedCostAllocation {
  readonly orderLineId: string;
  readonly amountMinor: number;
}

const weightOf = (line: LandedCostLineBasis) => (line.weightGrams !== null && line.weightGrams > 0 ? line.weightGrams : 0);

export const allocateLandedCost = (
  totalMinor: number,
  currency: string,
  method: LandedCostMethod,
  lines: readonly LandedCostLineBasis[],
): Effect.Effect<readonly LandedCostAllocation[], InvalidPurchaseOrderError> =>
  Effect.gen(function* () {
    if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) return yield* new InvalidPurchaseOrderError({ field: "landedCost", value: String(totalMinor) });
    if (lines.length === 0) return yield* new InvalidPurchaseOrderError({ field: "landedCostLines", value: "0" });
    if (!(LANDED_COST_METHODS as readonly string[]).includes(method)) return yield* new InvalidPurchaseOrderError({ field: "landedCostMethod", value: method });
    const weights = lines.map((line) => {
      if (method === "value") return Math.max(0, line.netMinor);
      if (method === "quantity") return Math.max(0, line.quantity);
      return weightOf(line);
    });
    if (weights.every((weight) => weight === 0)) return yield* new InvalidPurchaseOrderError({ field: "landedCostMethod", value: `${method}:0` });
    const code = yield* parseCurrency(currency).pipe(Effect.mapError(() => new InvalidPurchaseOrderError({ field: "currency", value: currency })));
    const parts = yield* allocate({ amountMinor: totalMinor, currency: code }, weights).pipe(
      Effect.mapError(() => new InvalidPurchaseOrderError({ field: "landedCost", value: "allocate" })),
    );
    return lines.map((line, index) => ({ orderLineId: line.orderLineId, amountMinor: parts[index]!.amountMinor }));
  });
