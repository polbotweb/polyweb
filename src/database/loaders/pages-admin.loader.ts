/**
 * Liste admin des pages (core/filters) : conditions SQL issues de l'URL canonique
 * (`pagesListDefinition`) et comptes de facettes statut / modèle / langue — chaque facette
 * est comptée avec les autres filtres actifs mais sans le sien (computeFacets, Effect).
 */
import { and, count, eq, ilike, or, type SQL } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { pages } from "@database/schemas";
import { computeFacets } from "@/core/filters/facets";
import { parseListUrlState } from "@/core/filters";
import { pagesListDefinition } from "@/lib/pages/admin-list";

export interface PagesAdminFilters {
  readonly q?: string;
  readonly status?: "published" | "draft";
  readonly template?: string;
  readonly locale?: string;
}

/** URL → filtres typés (valeurs hors définition ignorées par parseListUrlState). */
export function pagesAdminFiltersFromUrl(params: URLSearchParams | string): PagesAdminFilters {
  const { filters } = parseListUrlState(pagesListDefinition, params);
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const status = str(filters.status);
  return {
    q: str(filters.search),
    status: status === "published" || status === "draft" ? status : undefined,
    template: str(filters.template),
    locale: str(filters.locale),
  };
}

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Conditions SQL partagées par la liste, le total et les comptes de facettes. */
export function pagesAdminConditions(filters: PagesAdminFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.q) {
    const term = `%${escapeLike(filters.q)}%`;
    conditions.push(or(ilike(pages.title, term), ilike(pages.slug, term))!);
  }
  if (filters.status) conditions.push(eq(pages.isPublished, filters.status === "published"));
  if (filters.template) conditions.push(eq(pages.template, filters.template));
  if (filters.locale) conditions.push(eq(pages.locale, filters.locale));
  return conditions;
}

const grouped = <C extends typeof pages.isPublished | typeof pages.template | typeof pages.locale>(column: C, toValue: (raw: unknown) => string) =>
  async (f: PagesAdminFilters) => {
    const rows = await getDrizzle().select({ value: column, count: count() }).from(pages)
      .where(and(...pagesAdminConditions(f))).groupBy(column);
    return rows.map((r) => ({ value: toValue(r.value), count: Number(r.count) }));
  };

/** Comptes de facettes statut / modèle / langue (Effect, erreurs typées FacetError). */
export const getPagesAdminFacets = (filters: PagesAdminFilters = {}) =>
  computeFacets(filters, [
    { id: "status", filterKey: "status", count: grouped(pages.isPublished, (v) => (v ? "published" : "draft")) },
    { id: "template", filterKey: "template", count: grouped(pages.template, String) },
    { id: "locale", filterKey: "locale", count: grouped(pages.locale, String) },
  ]);

/** Total filtré (pagination). */
export const countPagesAdmin = (filters: PagesAdminFilters = {}) =>
  Effect.tryPromise(() => getDrizzle().select({ value: count() }).from(pages).where(and(...pagesAdminConditions(filters))))
    .pipe(Effect.map(([row]) => Number(row?.value ?? 0)));
