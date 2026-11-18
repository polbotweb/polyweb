/**
 * Rapprochement commande / réception / facture (2 ou 3 voies), avec tolérances
 * configurables (montant absolu et pourcentage) et politique bloquante ou
 * acceptation explicite des écarts.
 */
import { Effect } from "effect";
import type { MatchingMode, MatchingPolicy } from "./settings";

export const MATCH_STATUSES = ["unmatched", "matched", "qty_variance", "price_variance", "accepted"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export interface MatchLineInput {
  readonly id: string;
  readonly orderedQuantity: number;
  readonly receivedQuantity: number;
  readonly invoicedQuantity: number;
  readonly orderedUnitPriceMinor: number;
  readonly invoicedUnitPriceMinor: number;
}

export interface MatchTolerance {
  readonly absoluteMinor: number;
  readonly percent: number;
}

export interface LineMatch {
  readonly id: string;
  readonly status: MatchStatus;
  readonly quantityVariance: number;
  readonly priceVarianceMinor: number;
  readonly withinTolerance: boolean;
}

export interface DocumentMatch {
  readonly lines: readonly LineMatch[];
  readonly status: MatchStatus;
  readonly withinTolerance: boolean;
  /** Peut-on émettre / passer en bon à payer sans acceptation manuelle ? */
  readonly payable: boolean;
  /** L'émission est-elle bloquée (politique `block` et écart hors tolérance) ? */
  readonly blocked: boolean;
}

const qtyOf = (mode: MatchingMode, line: MatchLineInput) =>
  mode === "three_way" ? line.receivedQuantity : line.orderedQuantity;

/** Tolérance d'un écart de prix (montant = |Δpu| × qté facturée) : max(absolu, pourcentage du montant commandé). */
export const priceToleranceMinor = (orderedUnitPriceMinor: number, invoicedQuantity: number, tolerance: MatchTolerance) => {
  const ordered = Math.abs(orderedUnitPriceMinor) * Math.max(invoicedQuantity, 0);
  const fromPercent = Math.ceil((ordered * tolerance.percent) / 100);
  return Math.max(tolerance.absoluteMinor, fromPercent);
};

export const matchLine = (line: MatchLineInput, mode: MatchingMode, tolerance: MatchTolerance): LineMatch => {
  const referenceQty = qtyOf(mode, line);
  const quantityVariance = line.invoicedQuantity - referenceQty;
  const priceVarianceMinor = (line.invoicedUnitPriceMinor - line.orderedUnitPriceMinor) * line.invoicedQuantity;
  const absPrice = Math.abs(priceVarianceMinor);
  const qtyOk = quantityVariance === 0;
  const priceOk = absPrice <= priceToleranceMinor(line.orderedUnitPriceMinor, line.invoicedQuantity, tolerance);
  const withinTolerance = qtyOk && priceOk;
  const status: MatchStatus = !qtyOk ? "qty_variance" : !priceOk ? "price_variance" : "matched";
  return { id: line.id, status, quantityVariance, priceVarianceMinor, withinTolerance };
};

const documentStatus = (lines: readonly LineMatch[]): MatchStatus => {
  if (lines.length === 0) return "unmatched";
  if (lines.every((line) => line.status === "matched" || line.status === "accepted")) {
    return lines.every((line) => line.status === "matched") ? "matched" : "accepted";
  }
  if (lines.some((line) => line.status === "qty_variance")) return "qty_variance";
  if (lines.some((line) => line.status === "price_variance")) return "price_variance";
  return "unmatched";
};

export const matchDocument = (
  lines: readonly MatchLineInput[],
  mode: MatchingMode,
  tolerance: MatchTolerance,
  policy: MatchingPolicy,
  acceptedIds: ReadonlySet<string> = new Set(),
): DocumentMatch => {
  const matched = lines.map((line) => {
    const result = matchLine(line, mode, tolerance);
    if (policy === "allow_with_acceptance" && !result.withinTolerance && acceptedIds.has(line.id)) {
      return { ...result, status: "accepted" as const };
    }
    return result;
  });
  const withinTolerance = matched.every((line) => line.withinTolerance || line.status === "accepted");
  const payable = withinTolerance;
  const blocked = policy === "block" && !payable;
  return { lines: matched, status: documentStatus(matched), withinTolerance, payable, blocked };
};

export const assertIssuable = (match: DocumentMatch): Effect.Effect<DocumentMatch, { readonly _tag: "MatchBlockedError"; readonly message: string }> =>
  match.blocked
    ? Effect.fail({ _tag: "MatchBlockedError" as const, message: "Écart de rapprochement hors tolérance : émission bloquée par la politique de l'organisation." })
    : Effect.succeed(match);
