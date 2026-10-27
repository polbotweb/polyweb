/**
 * Grand livre de stock : filtres de consultation (admin), lus depuis les paramètres d'URL.
 * Lecture tolérante : un filtre invalide est ignoré (jamais d'erreur ni d'injection), la
 * pagination est bornée.
 */
import { MOVEMENT_KINDS, MOVEMENT_SOURCES, normalizeSku, type MovementKind, type MovementSource } from "./stock";

export const LEDGER_PAGE_SIZE = 50;
export const LEDGER_MAX_PAGE = 10_000;

export interface LedgerFilters {
  readonly warehouseId: string | null;
  /** Préfixe de SKU (normalisé en majuscules). */
  readonly sku: string | null;
  readonly kind: MovementKind | null;
  readonly source: MovementSource | null;
  readonly userId: string | null;
  /** Bornes de dates (UTC, incluses) au format AAAA-MM-JJ. */
  readonly from: string | null;
  readonly to: string | null;
  readonly page: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isDay = (value: string) => DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
const oneOf = <T extends string>(values: readonly T[], value: string): T | null => ((values as readonly string[]).includes(value) ? (value as T) : null);

export const parseLedgerFilters = (params: URLSearchParams): LedgerFilters => {
  const get = (name: string) => (params.get(name) ?? "").trim();
  const sku = normalizeSku(get("sku"));
  const page = Number(get("page"));
  const from = isDay(get("from")) ? get("from") : null;
  const to = isDay(get("to")) ? get("to") : null;
  return {
    warehouseId: UUID.test(get("warehouse")) ? get("warehouse") : null,
    sku: /^[A-Z0-9._-]{1,64}$/.test(sku) ? sku : null,
    kind: oneOf(MOVEMENT_KINDS, get("kind")),
    source: oneOf(MOVEMENT_SOURCES, get("source")),
    userId: USER_ID.test(get("user")) ? get("user") : null,
    // Bornes inversées : on les remet dans l'ordre plutôt que de renvoyer un résultat vide.
    from: from && to && from > to ? to : from,
    to: from && to && from > to ? from : to,
    page: Number.isSafeInteger(page) && page >= 1 ? Math.min(page, LEDGER_MAX_PAGE) : 1,
  };
};

/** Bornes horaires [début, fin) correspondant aux dates incluses `from` / `to`. */
export const ledgerDateRange = (filters: Pick<LedgerFilters, "from" | "to">) => ({
  start: filters.from ? new Date(`${filters.from}T00:00:00Z`) : null,
  end: filters.to ? new Date(Date.parse(`${filters.to}T00:00:00Z`) + 86_400_000) : null,
});

/** Paramètres d'URL d'une page du grand livre (filtres conservés). */
export const ledgerQuery = (filters: LedgerFilters, page = filters.page) => {
  const params = new URLSearchParams();
  if (filters.warehouseId) params.set("warehouse", filters.warehouseId);
  if (filters.sku) params.set("sku", filters.sku);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.source) params.set("source", filters.source);
  if (filters.userId) params.set("user", filters.userId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  return params.toString();
};

/** Motif LIKE d'un préfixe : `%`, `_` et `\` échappés. */
export const likePrefix = (value: string) => `${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
