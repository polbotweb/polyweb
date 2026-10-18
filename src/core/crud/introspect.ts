import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import type { CrudAccessRule, CrudAction, CrudColumn, CrudColumnType, CrudResourceDefinition } from "./contract";
import { SENSITIVE_COLUMN_PATTERN, assertCrudResourceDefinition } from "./contract";

const AUTO_COLUMNS = new Set(["createdAt", "updatedAt", "deletedAt"]);

function mapColumnType(columnType: string, dataType: string): CrudColumnType {
  if (/Boolean/.test(columnType)) return "boolean";
  if (/Timestamp|Date/.test(columnType)) return "date";
  if (/Json/.test(columnType)) return "json";
  if (/Integer|Serial|Real|Double|SmallInt|BigInt53/.test(columnType)) return "number";
  if (dataType === "number") return "number";
  return "string";
}

function toKebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
}

/** Construit la définition CRUD d'une table Drizzle, sans colonnes sensibles. */
export function introspectTable(
  table: PgTable,
  exportName: string,
  access: Partial<Record<CrudAction, CrudAccessRule>> = {},
): CrudResourceDefinition {
  const config = getTableConfig(table);
  const columnsByName = new Map(Object.entries(table as unknown as Record<string, unknown>));
  const columns: CrudColumn[] = [];
  let primaryKey: string | undefined;

  for (const column of config.columns) {
    const key = [...columnsByName.entries()].find(([, v]) => v === column)?.[0] ?? column.name;
    if (SENSITIVE_COLUMN_PATTERN.test(key)) continue;
    if (column.primary) primaryKey = key;
    const enumValues = (column as unknown as { enumValues?: string[] }).enumValues;
    columns.push({
      key,
      name: column.name,
      type: mapColumnType(column.columnType, column.dataType),
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      isPrimary: column.primary,
      writable: !column.primary && !AUTO_COLUMNS.has(key) && !column.generated,
      ...(enumValues && enumValues.length > 0 ? { enumValues } : {}),
    });
  }
  if (!primaryKey) throw new Error(`Table ${config.name} sans clé primaire simple : non supportée.`);

  const def: CrudResourceDefinition = {
    id: toKebab(exportName),
    exportName,
    tableName: config.name,
    primaryKey,
    columns,
    access: {
      list: access.list ?? "role:admin",
      read: access.read ?? "role:admin",
      create: access.create ?? "disabled",
      update: access.update ?? "disabled",
      delete: access.delete ?? "disabled",
    },
    sortable: columns.filter((c) => c.type !== "json").map((c) => c.key),
    filterable: columns.filter((c) => c.type === "string" || c.type === "boolean" || c.type === "number").map((c) => c.key),
  };
  assertCrudResourceDefinition(def);
  return def;
}
