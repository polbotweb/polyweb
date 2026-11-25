/**
 * Aides communes aux sources de rapprochement (pures) : jetons de référence d'un mouvement (pour
 * retrouver une pièce par son numéro) et conversion du restant dû d'une pièce en devise vers la
 * devise du mouvement au cours figé de la pièce (core/fx), arrondi au plus proche.
 */
import { Effect } from "effect";
import type { CurrencyCode } from "@/core/money";
import { convertAt, invert, parseRate } from "@/core/fx/rate";
import { normalizeReference } from "./normalize";
import type { ReconLine } from "./types";

/** Jetons normalisés (≥ 4 caractères, au moins un chiffre) du libellé et des références. */
export const referenceTokens = (line: Pick<ReconLine, "label" | "references">, max = 40): string[] => {
  const tokens = new Set<string>();
  for (const raw of [...line.references, ...line.label.split(/[\s,;/]+/)]) {
    const token = normalizeReference(raw);
    if (token.length >= 4 && token.length <= 35 && /\d/.test(token)) tokens.add(token);
    if (tokens.size >= max) break;
  }
  return [...tokens];
};

/**
 * Restant dû d'une pièce exprimé dans la devise du mouvement : identique si même devise ; si le
 * mouvement est en devise de tenue (EUR) et la pièce en devise, conversion au cours figé de la
 * pièce ; sinon `null` (pièce non proposée automatiquement).
 */
export const openInLineCurrency = (input: {
  readonly openMinor: number;
  readonly documentCurrency: string;
  readonly baseRate: string | null;
  readonly lineCurrency: string;
  readonly baseCurrency?: string;
}): Effect.Effect<number | null> => {
  const doc = input.documentCurrency.toUpperCase();
  const line = input.lineCurrency.toUpperCase();
  if (doc === line) return Effect.succeed(input.openMinor);
  if (line !== (input.baseCurrency ?? "EUR") || !input.baseRate) return Effect.succeed(null);
  return parseRate(input.baseRate).pipe(
    Effect.flatMap((rate) => convertAt({ amountMinor: input.openMinor, currency: doc as CurrencyCode }, line as CurrencyCode, rate, "half-up")),
    Effect.map((money) => money.amountMinor),
    Effect.orElseSucceed(() => null),
  );
};

/** Contre-valeur EUR d'un montant de pièce au cours figé (identité si la pièce est en EUR). */
export const baseValueOf = (amountMinor: number, currency: string, baseRate: string | null | undefined, baseCurrency = "EUR"): Effect.Effect<number | null> => {
  if (currency.toUpperCase() === baseCurrency) return Effect.succeed(amountMinor);
  if (!baseRate) return Effect.succeed(null);
  return parseRate(baseRate).pipe(
    Effect.flatMap((rate) => convertAt({ amountMinor, currency: currency.toUpperCase() as CurrencyCode }, baseCurrency as CurrencyCode, rate, "half-up")),
    Effect.map((money) => money.amountMinor),
    Effect.orElseSucceed(() => null),
  );
};

/** Montant de pièce correspondant à un montant dans la devise du mouvement (inverse du cours figé). */
export const documentAmountOf = (lineAmountMinor: number, lineCurrency: string, documentCurrency: string, baseRate: string | null | undefined): Effect.Effect<number | null> => {
  if (lineCurrency.toUpperCase() === documentCurrency.toUpperCase()) return Effect.succeed(lineAmountMinor);
  if (!baseRate) return Effect.succeed(null);
  return parseRate(baseRate).pipe(
    Effect.flatMap((rate) => convertAt({ amountMinor: lineAmountMinor, currency: lineCurrency.toUpperCase() as CurrencyCode }, documentCurrency.toUpperCase() as CurrencyCode, invert(rate), "half-up")),
    Effect.map((money) => money.amountMinor),
    Effect.orElseSucceed(() => null),
  );
};
