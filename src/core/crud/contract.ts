/**
 * Contrat des ressources CRUD générées (idée reprise de moda
 * `scripts/api-generator.ts`, réécrite et sécurisée).
 *
 * Une ressource décrit une table Drizzle, ses colonnes inscriptibles et une
 * matrice d'accès par action. Toute action non déclarée est `disabled`.
 */
export const CRUD_ACTIONS = ["list", "read", "create", "update", "delete"] as const;
export type CrudAction = (typeof CRUD_ACTIONS)[number];

/**
 * - `public`   : tout le monde (lecture seulement recommandée)
 * - `auth`     : utilisateur connecté et non banni
 * - `role:a|b` : rôle Better Auth global parmi la liste
 * - `permission:<ressource>:<action>` : vérifié via `auth.api.userHasPermission` (RBAC src/lib/permissions.ts)
 * - `disabled` : 404
 */
export type CrudAccessRule = "public" | "auth" | "disabled" | `role:${string}` | `permission:${string}:${string}`;

export type CrudColumnType = "string" | "number" | "boolean" | "date" | "json";

export interface CrudColumn {
  readonly key: string;
  readonly name: string;
  readonly type: CrudColumnType;
  readonly notNull: boolean;
  readonly hasDefault: boolean;
  readonly isPrimary: boolean;
  readonly writable: boolean;
  readonly enumValues?: readonly string[];
}

export interface CrudResourceDefinition {
  readonly id: string;
  readonly exportName: string;
  readonly tableName: string;
  readonly primaryKey: string;
  readonly columns: readonly CrudColumn[];
  readonly access: Readonly<Record<CrudAction, CrudAccessRule>>;
  readonly sortable: readonly string[];
  readonly filterable: readonly string[];
}

/** Colonnes jamais exposées ni inscriptibles par l'API générée. */
export const SENSITIVE_COLUMN_PATTERN = /(password|secret|token|hash|salt|private|otp)/i;

/** Tables refusées par le générateur (auth, sécurité). */
export const PROTECTED_TABLES = new Set([
  "user", "session", "account", "verification", "two_factor", "passkey",
  "api_tokens", "webhooks", "audit_log", "invitation", "member", "organization_role",
]);

export function parseAccessRule(raw: string): CrudAccessRule {
  if (raw === "public" || raw === "auth" || raw === "disabled") return raw;
  if (/^role:[a-z0-9_-]+(\|[a-z0-9_-]+)*$/i.test(raw)) return raw as CrudAccessRule;
  if (/^permission:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(raw)) return raw as CrudAccessRule;
  throw new Error(`Règle d'accès invalide : "${raw}"`);
}

export function assertCrudResourceDefinition(def: CrudResourceDefinition): void {
  if (!/^[a-z][a-z0-9-]*$/.test(def.id)) throw new Error(`Identifiant de ressource invalide : ${def.id}`);
  if (PROTECTED_TABLES.has(def.tableName)) throw new Error(`Table protégée : ${def.tableName}`);
  const keys = new Set(def.columns.map((c) => c.key));
  if (!keys.has(def.primaryKey)) throw new Error(`Clé primaire inconnue : ${def.primaryKey}`);
  for (const k of [...def.sortable, ...def.filterable]) if (!keys.has(k)) throw new Error(`Colonne inconnue : ${k}`);
  for (const c of def.columns) {
    if (c.writable && SENSITIVE_COLUMN_PATTERN.test(c.key)) throw new Error(`Colonne sensible inscriptible : ${c.key}`);
  }
  for (const action of Object.keys(def.access)) parseAccessRule(def.access[action as CrudAction]);
}
