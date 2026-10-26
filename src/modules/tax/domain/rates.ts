/**
 * Table des taux de TVA : taux par défaut (UE) + surcharges par organisation (table `tax_rates`).
 * Les taux par défaut sont un point de départ : chaque tenant les vérifie et les surcharge
 * (avec période de validité) depuis le back-office ; la ligne la plus spécifique et valide
 * à la date de l'opération l'emporte. Taux exprimés en pourcentage décimal (« 5.5 »).
 */
import { Data, Effect } from "effect";
import { computeTaxTotals, type CurrencyCode, type Money, type TaxLine } from "@/core/money";
import { determineTax, type CustomerType, type TaxCategory, type TaxContext, type TaxDetermination } from "./rules";

export interface TaxRateEntry {
  readonly countryCode: string;
  readonly category: TaxCategory;
  readonly ratePercent: string;
  /** Restreint à un type de client ; null / absent = B2B et B2C. */
  readonly customerType?: CustomerType | null;
  /** Date ISO (incluse) ; null = sans borne. */
  readonly validFrom?: string | null;
  /** Date ISO (exclue) ; null = sans borne. */
  readonly validTo?: string | null;
  /** Ligne propre à un tenant (prioritaire sur les taux par défaut). */
  readonly organizationId?: string | null;
}

/** Taux standard de chacun des 27 États membres + taux réduits des principaux marchés (à vérifier par tenant). */
const STANDARD: Record<string, string> = {
  AT: "20", BE: "21", BG: "20", CY: "19", CZ: "21", DE: "19", DK: "25", EE: "24", ES: "21", FI: "25.5", FR: "20", GR: "24", HR: "25", HU: "27",
  IE: "23", IT: "22", LT: "21", LU: "17", LV: "21", MT: "18", NL: "21", PL: "23", PT: "23", RO: "21", SE: "25", SI: "22", SK: "23",
};

const REDUCED: ReadonlyArray<readonly [string, TaxCategory, string]> = [
  ["FR", "reduced", "10"], ["FR", "reduced-2", "5.5"], ["FR", "super-reduced", "2.1"],
  ["DE", "reduced", "7"],
  ["ES", "reduced", "10"], ["ES", "super-reduced", "4"],
  ["IT", "reduced", "10"], ["IT", "reduced-2", "5"], ["IT", "super-reduced", "4"],
  ["BE", "reduced", "12"], ["BE", "reduced-2", "6"],
  ["NL", "reduced", "9"],
  ["AT", "reduced", "13"], ["AT", "reduced-2", "10"],
  ["PT", "reduced", "13"], ["PT", "reduced-2", "6"],
  ["LU", "reduced", "14"], ["LU", "reduced-2", "8"], ["LU", "super-reduced", "3"],
  ["IE", "reduced", "13.5"], ["IE", "reduced-2", "9"], ["IE", "super-reduced", "4.8"],
  ["PL", "reduced", "8"], ["PL", "reduced-2", "5"],
  ["SE", "reduced", "12"], ["SE", "reduced-2", "6"],
];

export const DEFAULT_TAX_RATES: readonly TaxRateEntry[] = [
  ...Object.entries(STANDARD).map(([countryCode, ratePercent]) => ({ countryCode, category: "standard" as const, ratePercent })),
  ...REDUCED.map(([countryCode, category, ratePercent]) => ({ countryCode, category, ratePercent })),
];

export class TaxRateNotFoundError extends Data.TaggedError("TaxRateNotFoundError")<{ readonly countryCode: string; readonly category: TaxCategory; readonly date: string }> {
  override get message() {
    return `Aucun taux de TVA pour ${this.countryCode} / ${this.category} au ${this.date}`;
  }
}

const isValidAt = (entry: TaxRateEntry, date: string) => (!entry.validFrom || entry.validFrom <= date) && (!entry.validTo || date < entry.validTo);

/**
 * Taux applicable : `zero`/`exempt` → 0 ; sinon, parmi les lignes valides à la date, priorité à la ligne
 * du tenant, puis au type de client explicite, puis à la `validFrom` la plus récente ; enfin taux par défaut.
 */
export const resolveTaxRate = (
  entries: readonly TaxRateEntry[],
  query: { readonly countryCode: string; readonly category: TaxCategory; readonly date: string; readonly customerType?: CustomerType },
): Effect.Effect<string, TaxRateNotFoundError> => {
  if (query.category === "zero" || query.category === "exempt") return Effect.succeed("0");
  const country = query.countryCode.toUpperCase();
  const candidates = entries
    .filter((entry) => entry.countryCode.toUpperCase() === country && entry.category === query.category && isValidAt(entry, query.date) && (!entry.customerType || entry.customerType === query.customerType))
    .sort((a, b) =>
      Number(Boolean(b.organizationId)) - Number(Boolean(a.organizationId))
      || Number(Boolean(b.customerType)) - Number(Boolean(a.customerType))
      || (b.validFrom ?? "").localeCompare(a.validFrom ?? ""));
  return candidates[0] ? Effect.succeed(candidates[0].ratePercent) : Effect.fail(new TaxRateNotFoundError({ countryCode: country, category: query.category, date: query.date }));
};

export interface TaxableLine {
  readonly net: Money;
  readonly category: TaxCategory;
}

/**
 * Calcule les taxes d'un document : régime (rules.ts) → taux par ligne → totaux core/money
 * (ventilation par taux, arrondi `half-up` par taux par défaut).
 */
export const computeDocumentTax = (
  lines: readonly TaxableLine[],
  options: { readonly context: TaxContext; readonly currency: CurrencyCode; readonly date: string; readonly rates?: readonly TaxRateEntry[]; readonly strategy?: "per-rate" | "per-line" },
) =>
  Effect.gen(function* () {
    const determination: TaxDetermination = yield* determineTax(options.context);
    const table = [...(options.rates ?? []), ...DEFAULT_TAX_RATES];
    const taxLines: TaxLine[] = [];
    for (const line of lines) {
      const ratePercent = determination.charged && determination.taxCountry
        ? yield* resolveTaxRate(table, { countryCode: determination.taxCountry, category: line.category, date: options.date, customerType: options.context.customerType })
        : "0";
      taxLines.push({ net: line.net, ratePercent });
    }
    const totals = yield* computeTaxTotals(taxLines, { currency: options.currency, strategy: options.strategy });
    return { determination, lines: taxLines, totals };
  });
