/**
 * Facettes avec comptes (core/filters) — génériques, Effect.
 *
 * Règle standard des facettes : les comptes d'une facette sont calculés avec TOUS les autres
 * filtres actifs mais SANS le sien (sinon une facette sélectionnée masquerait ses alternatives).
 * Chaque module fournit, par facette, une fonction de comptage (GROUP BY dans son périmètre
 * tenant) ; le cœur orchestre (concurrence bornée, erreurs typées) et produit des liens
 * d'URL canoniques accessibles (état actif, compte, href de bascule).
 */
import { Data, Effect } from "effect";
import type { AdminResourceListDefinition } from "@/core/admin/filter-contract";
import { parseListUrlState, serializeListUrlState, toggleFacetValue, type ListUrlState } from "./url-state";

export class FacetError extends Data.TaggedError("FacetError")<{ readonly facet: string; readonly cause: unknown }> {}

export interface FacetBucket { readonly value: string; readonly count: number }

export interface FacetSpec<F> {
  readonly id: string;
  /** Clé de filtre (dans F) neutralisée pour le comptage de cette facette. */
  readonly filterKey: keyof F;
  readonly count: (filtersWithoutSelf: F) => Promise<readonly FacetBucket[]>;
}

/** Comptes de toutes les facettes (chacune sans son propre filtre), concurrence bornée. */
export function computeFacets<F extends object>(filters: F, specs: readonly FacetSpec<F>[], concurrency = 4): Effect.Effect<Record<string, readonly FacetBucket[]>, FacetError> {
  return Effect.forEach(specs, (spec) => {
    const without = { ...filters, [spec.filterKey]: undefined } as F;
    return Effect.tryPromise({ try: () => spec.count(without), catch: (cause) => new FacetError({ facet: spec.id, cause }) }).pipe(
      Effect.map((buckets) => [spec.id, [...buckets].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))] as const),
    );
  }, { concurrency }).pipe(Effect.map((entries) => Object.fromEntries(entries)));
}

export interface FacetLink {
  readonly value: string;
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
  /** URL canonique qui bascule cette valeur (retour page 1). */
  readonly href: string;
}

/**
 * Liens de facette pour un filtre de la définition : select → choisir / désélectionner,
 * multi-select → bascule, boolean → true/false exclusifs. Les valeurs actives sans résultat
 * restent affichées (compte 0) pour pouvoir être retirées.
 */
export function facetLinks(definition: AdminResourceListDefinition, query: URLSearchParams | string, filterId: string, buckets: readonly FacetBucket[], baseUrl: string, label: (value: string) => string = (v) => v): FacetLink[] {
  const def = definition.filters?.find((f) => f.id === filterId);
  if (!def) return [];
  const state = parseListUrlState(definition, query);
  const current = state.filters[filterId];
  const isActive = (value: string) => (Array.isArray(current) ? current.includes(value) : typeof current === "boolean" ? String(current) === value : current === value);
  const all = new Map(buckets.map((b) => [b.value, b.count]));
  for (const v of Array.isArray(current) ? current : current !== undefined && typeof current !== "object" ? [String(current)] : []) if (!all.has(v)) all.set(v, 0);
  const next = (value: string): ListUrlState => {
    if (def.kind === "multi-select") return toggleFacetValue(state, filterId, value);
    const filters = { ...state.filters } as Record<string, unknown>;
    if (isActive(value)) delete filters[filterId];
    else filters[filterId] = def.kind === "boolean" ? value === "true" : value;
    return { ...state, filters: filters as ListUrlState["filters"], page: 1 };
  };
  return [...all.entries()].map(([value, count]) => {
    const qs = serializeListUrlState(definition, next(value)).toString();
    return { value, label: label(value), count, active: isActive(value), href: qs ? `${baseUrl}?${qs}` : baseUrl };
  });
}
