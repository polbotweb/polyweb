/**
 * Tableau de bord ERP — domaine pur (sans E/S) : filtres d'URL validés, découpage en périodes,
 * fusion des séries et indicateurs dérivés. Toutes les dates sont des jours civils UTC
 * (`YYYY-MM-DD`) ; les montants sont en unités mineures ISO 4217 (entiers).
 */
import { isCurrencyCode, type CurrencyCode } from "@/core/money";

export const GRANULARITIES = ["month", "quarter", "year"] as const;
export type Granularity = (typeof GRANULARITIES)[number];
export const isGranularity = (v: string): v is Granularity => (GRANULARITIES as readonly string[]).includes(v);

/** Au-delà, le tableau devient illisible et la requête coûteuse : filtre refusé. */
export const MAX_BUCKETS = 120;
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;
export const MAX_LOW_STOCK_THRESHOLD = 100_000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Jour civil valide (refuse 2026-02-30, formats approximatifs). */
export const isIsoDate = (v: string): boolean => {
  if (!DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Début de la période (granularité) contenant le jour `date`. */
export const bucketStart = (date: string, granularity: Granularity): string => {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  if (granularity === "year") return ymd(y, 1, 1);
  if (granularity === "quarter") return ymd(y, Math.floor((m - 1) / 3) * 3 + 1, 1);
  return ymd(y, m, 1);
};

const nextBucket = (start: string, granularity: Granularity): string => {
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7));
  if (granularity === "year") return ymd(y + 1, 1, 1);
  const step = granularity === "quarter" ? 3 : 1;
  const nm = m + step;
  return nm > 12 ? ymd(y + 1, nm - 12, 1) : ymd(y, nm, 1);
};

/** Débuts de période couvrant [from, to] (bornes incluses), dans l'ordre. */
export const bucketStarts = (from: string, to: string, granularity: Granularity): readonly string[] => {
  const out: string[] = [];
  for (let b = bucketStart(from, granularity); b <= to && out.length <= MAX_BUCKETS; b = nextBucket(b, granularity)) out.push(b);
  return out;
};

export interface DashboardFilters {
  readonly from: string;
  readonly to: string;
  readonly granularity: Granularity;
  readonly currency: CurrencyCode;
  readonly lowStockThreshold: number;
}

export type DashboardFilterError = "invalidDate" | "invalidRange" | "invalidCurrency" | "invalidThreshold";

/**
 * Filtres depuis l'URL. Toute valeur invalide est remplacée par sa valeur par défaut et signalée
 * (jamais d'erreur 500 sur une saisie). Défaut : année civile en cours jusqu'à aujourd'hui, par mois.
 */
export const dashboardFiltersFromUrl = (
  params: URLSearchParams,
  options: { readonly today: string; readonly defaultCurrency?: CurrencyCode; readonly defaultThreshold?: number },
): { readonly filters: DashboardFilters; readonly errors: readonly DashboardFilterError[] } => {
  const errors: DashboardFilterError[] = [];
  const defaults: DashboardFilters = {
    from: `${options.today.slice(0, 4)}-01-01`,
    to: options.today,
    granularity: "month",
    currency: options.defaultCurrency ?? "EUR",
    lowStockThreshold: options.defaultThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
  };
  const raw = (k: string) => (params.get(k) ?? "").trim();

  let from = raw("from") || defaults.from;
  let to = raw("to") || defaults.to;
  if (!isIsoDate(from) || !isIsoDate(to)) {
    errors.push("invalidDate");
    from = isIsoDate(from) ? from : defaults.from;
    to = isIsoDate(to) ? to : defaults.to;
  }
  const granularity = isGranularity(raw("granularity")) ? (raw("granularity") as Granularity) : defaults.granularity;
  if (from > to || bucketStarts(from, to, granularity).length > MAX_BUCKETS) {
    errors.push("invalidRange");
    from = defaults.from;
    to = defaults.to;
  }

  const currencyRaw = raw("currency").toUpperCase();
  const currency = currencyRaw === "" ? defaults.currency : isCurrencyCode(currencyRaw) ? currencyRaw : (errors.push("invalidCurrency"), defaults.currency);

  const thresholdRaw = raw("threshold");
  let lowStockThreshold = defaults.lowStockThreshold;
  if (thresholdRaw !== "") {
    const n = /^\d{1,6}$/.test(thresholdRaw) ? Number(thresholdRaw) : Number.NaN;
    if (Number.isInteger(n) && n <= MAX_LOW_STOCK_THRESHOLD) lowStockThreshold = n;
    else errors.push("invalidThreshold");
  }
  return { filters: { from, to, granularity, currency, lowStockThreshold }, errors };
};

/** Seuil d'alerte par défaut depuis l'environnement (`DASHBOARD_LOW_STOCK_THRESHOLD`), borné. */
export const lowStockThresholdFromEnv = (value: string | undefined): number => {
  const n = /^\d{1,6}$/.test((value ?? "").trim()) ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n <= MAX_LOW_STOCK_THRESHOLD ? n : DEFAULT_LOW_STOCK_THRESHOLD;
};
