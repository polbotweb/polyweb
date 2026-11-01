/**
 * Fabrique de ressources API en lecture sur une table Drizzle « tenantisée »
 * (`organization_id`, `null` = plateforme) : pagination par curseur
 * (createdAt DESC, id DESC), filtres déclarés, lecture par id DANS le tenant.
 * Les modules n'écrivent que la sérialisation et les filtres.
 */
import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { Effect } from "effect";
import { dbTry } from "@/lib/effect/run";
import type { ApiFilterDefinition, ApiListQuery, ApiTenant } from "./contract";
import { afterCursor, pageOf } from "./cursor";

/** Condition « même tenant » (organisation du site de la clé). */
export const tenantWhere = (column: AnyPgColumn, tenant: ApiTenant): SQL =>
  tenant.organizationId === null ? isNull(column) : eq(column, tenant.organizationId);

export interface TableFilter extends ApiFilterDefinition {
  readonly where: (value: string) => SQL | undefined;
}

export interface TableSource<Row extends { id: string; createdAt: Date }> {
  readonly name: string;
  readonly columns: { readonly id: AnyPgColumn; readonly createdAt: AnyPgColumn; readonly organizationId: AnyPgColumn };
  /** Requête de base (select … from …), éventuellement jointe. */
  readonly select: (where: SQL | undefined, limit: number) => Promise<Row[]>;
  /** Condition fixe supplémentaire (ex. `kind = 'invoice'`). */
  readonly scope?: SQL;
  readonly filters?: readonly TableFilter[];
}

export function tableReader<Row extends { id: string; createdAt: Date }, Out>(source: TableSource<Row>, serialize: (row: Row) => Out) {
  const filters = source.filters ?? [];
  const list = (tenant: ApiTenant, q: ApiListQuery) =>
    Effect.gen(function* () {
      const conditions = [
        tenantWhere(source.columns.organizationId, tenant),
        source.scope,
        afterCursor(source.columns.createdAt, source.columns.id, q.cursor),
        ...filters.map((f) => (q.filters[f.name] !== undefined ? f.where(q.filters[f.name]!) : undefined)),
      ];
      const rows = yield* dbTry(`api.${source.name}.list`, () => source.select(and(...conditions), q.limit + 1));
      const page = pageOf(rows, q.limit);
      return { items: page.items.map(serialize), last: page.last };
    });
  const find = (tenant: ApiTenant, id: string) =>
    dbTry(`api.${source.name}.get`, () => source.select(and(eq(source.columns.id, id), tenantWhere(source.columns.organizationId, tenant), source.scope), 1)).pipe(
      Effect.map((rows) => rows[0]),
    );
  const get = (tenant: ApiTenant, id: string) => find(tenant, id).pipe(Effect.map((row) => (row ? serialize(row) : undefined)));
  return { list, get, find, filters: filters.map(({ name, description, values }) => ({ name, description, ...(values ? { values } : {}) })) };
}

/** Tri standard des listes (à utiliser dans `select`). */
export const listOrder = (createdAt: AnyPgColumn, id: AnyPgColumn) => [desc(createdAt), desc(id)] as const;

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
