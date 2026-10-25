/**
 * Contrat d'état d'URL des listes admin (filtres à facettes, tri, pagination) — pur, partagé
 * par tous les modules. L'URL est la source de vérité : une vue filtrée est partageable par
 * lien et une vue enregistrée n'est qu'une requête canonique.
 *
 * Conventions de paramètres (à partir de `queryParam`) :
 *   search / select   → `?p=valeur`
 *   multi-select      → `?p=a&p=b` (répété ; dédoublonné, trié)
 *   boolean           → `?p=true|false`
 *   date              → `?pFrom=AAAA-MM-JJ&pTo=AAAA-MM-JJ` (bornes inclusives, inversées si besoin)
 *   number-range      → `?pMin=n&pMax=n` (bornées par min/max de la définition)
 *   tri               → `sortBy` (tri déclaré) + `sortOrder` (asc|desc) ; page → `page` (≥ 1)
 *
 * Toute valeur inconnue, mal formée ou hors bornes est IGNORÉE (jamais d'erreur, jamais
 * transmise telle quelle à une requête) : `serialize(parse(x))` est la forme canonique.
 */
import type { AdminResourceFilterDefinition, AdminResourceListDefinition } from "@/core/admin/filter-contract";

export const MAX_FILTER_TEXT = 200;
export const MAX_MULTI_VALUES = 50;
export const MAX_PAGE = 10_000;

export interface DateRange { readonly from?: string; readonly to?: string }
export interface NumberRange { readonly min?: number; readonly max?: number }
export type FilterValue = string | readonly string[] | boolean | DateRange | NumberRange;

export interface ListUrlState {
  readonly filters: Readonly<Record<string, FilterValue>>;
  readonly sort?: { readonly id: string; readonly direction: "asc" | "desc" };
  readonly page: number;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isValidDay = (v: string) => ISO_DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
const clean = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t && t.length <= MAX_FILTER_TEXT ? t : undefined;
};
const allowed = (def: AdminResourceFilterDefinition, v: string) => !def.options || def.options.includes(v);

function parseFilter(def: AdminResourceFilterDefinition, params: URLSearchParams): FilterValue | undefined {
  const p = def.queryParam;
  switch (def.kind) {
    case "search": return clean(params.get(p));
    case "select": {
      const v = clean(params.get(p));
      return v && allowed(def, v) ? v : undefined;
    }
    case "multi-select": {
      const values = [...new Set(params.getAll(p).flatMap((raw) => raw.split(",")).map(clean).filter((v): v is string => !!v && allowed(def, v)))].sort().slice(0, MAX_MULTI_VALUES);
      return values.length ? values : undefined;
    }
    case "boolean": {
      const v = params.get(p);
      return v === "true" ? true : v === "false" ? false : undefined;
    }
    case "date": {
      let from = clean(params.get(`${p}From`));
      let to = clean(params.get(`${p}To`));
      if (from && !isValidDay(from)) from = undefined;
      if (to && !isValidDay(to)) to = undefined;
      if (from && to && from > to) [from, to] = [to, from];
      return from || to ? { ...(from ? { from } : {}), ...(to ? { to } : {}) } : undefined;
    }
    case "number-range": {
      const num = (raw: string | null) => {
        if (raw === null || raw.trim() === "") return undefined;
        const n = Number(raw);
        if (!Number.isFinite(n)) return undefined;
        return Math.min(def.max ?? Number.MAX_SAFE_INTEGER, Math.max(def.min ?? Number.MIN_SAFE_INTEGER, n));
      };
      let min = num(params.get(`${p}Min`));
      let max = num(params.get(`${p}Max`));
      if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
      return min !== undefined || max !== undefined ? { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) } : undefined;
    }
  }
}

/** URL → état typé et validé (valeurs invalides ignorées). */
export function parseListUrlState(definition: AdminResourceListDefinition, input: URLSearchParams | string): ListUrlState {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const filters: Record<string, FilterValue> = {};
  for (const def of definition.filters ?? []) {
    const value = parseFilter(def, params);
    if (value !== undefined) filters[def.id] = value;
  }
  const sortParam = definition.sorts?.[0]?.queryParam ?? "sortBy";
  const sortId = params.get(sortParam);
  const sortDef = definition.sorts?.find((s) => s.id === sortId) ?? definition.sorts?.find((s) => s.id === definition.defaultSort);
  const order = params.get("sortOrder");
  const direction = sortDef && (order === "asc" || order === "desc") && sortDef.directions.includes(order) ? order : sortDef?.directions.includes("desc") ? "desc" : sortDef?.directions[0];
  const rawPage = Number(params.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? Math.min(rawPage, MAX_PAGE) : 1;
  return { filters, ...(sortDef && direction ? { sort: { id: sortDef.id, direction } } : {}), page };
}

/** État → URL canonique (ordre des définitions, défauts omis : tri par défaut, page 1). */
export function serializeListUrlState(definition: AdminResourceListDefinition, state: ListUrlState): URLSearchParams {
  const out = new URLSearchParams();
  for (const def of definition.filters ?? []) {
    const value = state.filters[def.id];
    if (value === undefined) continue;
    const p = def.queryParam;
    if (def.kind === "multi-select" && Array.isArray(value)) for (const v of value) out.append(p, v);
    else if (def.kind === "boolean" && typeof value === "boolean") out.set(p, String(value));
    else if (def.kind === "date" && typeof value === "object" && !Array.isArray(value)) {
      const r = value as DateRange;
      if (r.from) out.set(`${p}From`, r.from);
      if (r.to) out.set(`${p}To`, r.to);
    } else if (def.kind === "number-range" && typeof value === "object" && !Array.isArray(value)) {
      const r = value as NumberRange;
      if (r.min !== undefined) out.set(`${p}Min`, String(r.min));
      if (r.max !== undefined) out.set(`${p}Max`, String(r.max));
    } else if (typeof value === "string") out.set(p, value);
  }
  const defaultSort = definition.sorts?.find((s) => s.id === definition.defaultSort);
  const defaultDirection = defaultSort?.directions.includes("desc") ? "desc" : defaultSort?.directions[0];
  if (state.sort && !(state.sort.id === defaultSort?.id && state.sort.direction === defaultDirection)) {
    out.set(definition.sorts?.[0]?.queryParam ?? "sortBy", state.sort.id);
    out.set("sortOrder", state.sort.direction);
  }
  if (state.page > 1) out.set("page", String(state.page));
  return out;
}

/** Requête canonique (chaîne) : clé d'une vue enregistrée, comparaison de vues. */
export const canonicalListQuery = (definition: AdminResourceListDefinition, input: URLSearchParams | string): string =>
  serializeListUrlState(definition, parseListUrlState(definition, input)).toString();

/** Nombre de filtres actifs (badge « n filtres », bouton « tout effacer »). */
export const activeFilterCount = (state: ListUrlState): number => Object.keys(state.filters).length;

/** Bascule une valeur de facette (multi-select) ; revient à la page 1. */
export function toggleFacetValue(state: ListUrlState, filterId: string, value: string): ListUrlState {
  const current = state.filters[filterId];
  const values = new Set(Array.isArray(current) ? current : typeof current === "string" ? [current] : []);
  if (values.has(value)) values.delete(value); else values.add(value);
  const filters = { ...state.filters };
  if (values.size) filters[filterId] = [...values].sort(); else delete filters[filterId];
  return { ...state, filters, page: 1 };
}

/** Retire un filtre (puce « × ») ; revient à la page 1. */
export function clearFilter(state: ListUrlState, filterId?: string): ListUrlState {
  if (!filterId) return { ...state, filters: {}, page: 1 };
  const filters = { ...state.filters };
  delete filters[filterId];
  return { ...state, filters, page: 1 };
}
