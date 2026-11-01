/** Curseur opaque de pagination par clé (createdAt, id), encodé en base64url. */
import { and, eq, lt, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export interface CursorKey {
  readonly createdAt: Date;
  readonly id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify([key.createdAt.toISOString(), key.id])).toString("base64url");
}

/** `null` si le curseur est absent ; `undefined` s'il est invalide. */
export function decodeCursor(raw: string | null | undefined): CursorKey | null | undefined {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 2) return undefined;
    const [at, id] = parsed as [unknown, unknown];
    if (typeof at !== "string" || typeof id !== "string" || !UUID.test(id)) return undefined;
    const createdAt = new Date(at);
    return Number.isNaN(createdAt.getTime()) ? undefined : { createdAt, id };
  } catch {
    return undefined;
  }
}

/** Condition « après le curseur » pour un tri `createdAt DESC, id DESC`. */
export function afterCursor(createdAt: AnyPgColumn, id: AnyPgColumn, cursor: CursorKey | null): SQL | undefined {
  if (!cursor) return undefined;
  return or(lt(createdAt, cursor.createdAt), and(eq(createdAt, cursor.createdAt), lt(id, cursor.id)));
}

/** Découpe `limit + 1` lignes en page + clé du dernier élément si une suite existe. */
export function pageOf<T extends { createdAt: Date; id: string }>(rows: readonly T[], limit: number) {
  const items = rows.slice(0, limit);
  const last = rows.length > limit ? items[items.length - 1]! : null;
  return { items, last: last ? { createdAt: last.createdAt, id: last.id } : null };
}
