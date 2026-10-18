/**
 * Moteur CRUD générique pour les ressources générées par `pnpm api:generate`.
 *
 * Sécurité : matrice d'accès par action (défaut `disabled`), colonnes
 * sensibles exclues, validation stricte (clés inconnues refusées), tri et
 * filtres limités aux colonnes déclarées, pagination bornée.
 */
import { z } from "astro/zod";
import { and, asc, desc, eq, count, type SQL } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import type { DrizzleDB } from "@database/drizzle";
import type { CrudAccessRule, CrudAction, CrudColumn, CrudResourceDefinition } from "./contract";

export interface CrudActor {
  id: string;
  role?: string | null;
  banned?: boolean | null;
}

export type PermissionChecker = (resource: string, action: string) => Promise<boolean>;

export interface CrudRegistration {
  definition: CrudResourceDefinition;
  table: PgTable;
}

export async function evaluateAccess(
  rule: CrudAccessRule,
  actor: CrudActor | null,
  hasPermission?: PermissionChecker,
): Promise<boolean> {
  if (rule === "disabled") return false;
  if (rule === "public") return true;
  if (!actor || actor.banned) return false;
  if (rule === "auth") return true;
  if (rule.startsWith("role:")) {
    const roles = rule.slice(5).split("|");
    const actorRoles = (actor.role ?? "").split(",").map((r) => r.trim());
    return actorRoles.some((r) => roles.includes(r));
  }
  if (rule.startsWith("permission:")) {
    const [, resource, action] = rule.split(":");
    return hasPermission ? hasPermission(resource!, action!) : false;
  }
  return false;
}

function columnSchema(column: CrudColumn): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  switch (column.type) {
    case "number": schema = z.number().finite(); break;
    case "boolean": schema = z.boolean(); break;
    case "date": schema = z.coerce.date(); break;
    case "json": schema = z.unknown(); break;
    default:
      schema = column.enumValues ? z.enum(column.enumValues as [string, ...string[]]) : z.string().max(10_000);
  }
  if (!column.notNull) schema = schema.nullable();
  return schema;
}

export function buildInputSchema(def: CrudResourceDefinition, mode: "create" | "update") {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const column of def.columns) {
    if (!column.writable) continue;
    const base = columnSchema(column);
    const required = mode === "create" && column.notNull && !column.hasDefault;
    shape[column.key] = required ? base : base.optional();
  }
  const schema = z.object(shape).strict();
  return mode === "update" ? schema.refine((v) => Object.keys(v).length > 0, { message: "Aucun champ à modifier." }) : schema;
}

export interface CrudRequest {
  method: string;
  id?: string | null;
  searchParams: URLSearchParams;
  body?: unknown;
  actor: CrudActor | null;
  hasPermission?: PermissionChecker;
}

export interface CrudResponse {
  status: number;
  body: unknown;
}

function actionFor(method: string, hasId: boolean): CrudAction | null {
  switch (method.toUpperCase()) {
    case "GET": return hasId ? "read" : "list";
    case "POST": return hasId ? null : "create";
    case "PATCH": case "PUT": return hasId ? "update" : null;
    case "DELETE": return hasId ? "delete" : null;
    default: return null;
  }
}

function col(table: PgTable, key: string): PgColumn {
  return (table as unknown as Record<string, PgColumn>)[key]!;
}

function project(def: CrudResourceDefinition, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of def.columns) out[c.key] = row[c.key];
  return out;
}

function parseFilterValue(column: CrudColumn, raw: string): unknown {
  if (column.type === "boolean") return raw === "true";
  if (column.type === "number") return Number(raw);
  return raw;
}

export async function handleCrud(registration: CrudRegistration, request: CrudRequest, db: DrizzleDB): Promise<CrudResponse> {
  const { definition: def, table } = registration;
  const action = actionFor(request.method, Boolean(request.id));
  if (!action) return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
  const rule = def.access[action];
  if (rule === "disabled") return { status: 404, body: { error: "NOT_FOUND" } };
  if (!(await evaluateAccess(rule, request.actor, request.hasPermission))) {
    return { status: request.actor ? 403 : 401, body: { error: request.actor ? "FORBIDDEN" : "UNAUTHORIZED" } };
  }
  const pk = col(table, def.primaryKey);

  if (action === "list") {
    const page = Math.max(1, Number(request.searchParams.get("page")) || 1);
    const perPage = Math.min(100, Math.max(1, Number(request.searchParams.get("perPage")) || 20));
    const sortKey = request.searchParams.get("sort") ?? def.primaryKey;
    const direction = request.searchParams.get("order") === "desc" ? desc : asc;
    if (!def.sortable.includes(sortKey)) return { status: 400, body: { error: "INVALID_SORT" } };
    const filters: SQL[] = [];
    for (const key of def.filterable) {
      const raw = request.searchParams.get(`filter[${key}]`);
      if (raw === null) continue;
      const column = def.columns.find((c) => c.key === key)!;
      filters.push(eq(col(table, key), parseFilterValue(column, raw)));
    }
    const where = filters.length ? and(...filters) : undefined;
    const rows = await db.select().from(table).where(where).orderBy(direction(col(table, sortKey))).limit(perPage).offset((page - 1) * perPage);
    const [{ total }] = await db.select({ total: count() }).from(table).where(where);
    return { status: 200, body: { data: rows.map((r) => project(def, r as Record<string, unknown>)), meta: { page, perPage, total: Number(total) } } };
  }

  if (action === "read") {
    const [row] = await db.select().from(table).where(eq(pk, request.id!)).limit(1);
    return row ? { status: 200, body: { data: project(def, row as Record<string, unknown>) } } : { status: 404, body: { error: "NOT_FOUND" } };
  }

  if (action === "delete") {
    const deleted = await db.delete(table).where(eq(pk, request.id!)).returning();
    return deleted.length ? { status: 204, body: null } : { status: 404, body: { error: "NOT_FOUND" } };
  }

  const parsed = buildInputSchema(def, action).safeParse(request.body ?? {});
  if (!parsed.success) return { status: 422, body: { error: "VALIDATION_ERROR", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } };

  if (action === "create") {
    const [row] = await db.insert(table).values(parsed.data as never).returning();
    return { status: 201, body: { data: project(def, row as Record<string, unknown>) } };
  }

  const [row] = await db.update(table).set(parsed.data as never).where(eq(pk, request.id!)).returning();
  return row ? { status: 200, body: { data: project(def, row as Record<string, unknown>) } } : { status: 404, body: { error: "NOT_FOUND" } };
}
