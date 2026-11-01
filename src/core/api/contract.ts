/**
 * Contrat des ressources de l'API publique v1.
 *
 * Chaque module déclare ses ressources (lecture paginée par curseur, lecture
 * par id, écritures optionnelles), ses scopes et ses événements webhook dans
 * un `ModuleApiDeclaration` ; le cœur les enregistre au démarrage et expose
 * des routes génériques `/api/v1/{resource}` + la spec OpenAPI. Aucun
 * endpoint n'est câblé à la main par module.
 */
import type { Effect } from "effect";
import type { AppServices } from "@/lib/effect/runtime";
import type { EventDefinition } from "@/core/events";

/** Tenant d'une requête : site de la clé + organisation propriétaire du site (`null` = plateforme). */
export interface ApiTenant {
  readonly siteId: string;
  readonly organizationId: string | null;
}

export interface ApiFilterDefinition {
  readonly name: string;
  readonly description: string;
  /** Valeurs admises (énumération) ; absent = chaîne libre. */
  readonly values?: readonly string[];
}

/** Schéma JSON (sous-ensemble OpenAPI 3.1) d'une propriété. */
export interface ApiPropertySchema {
  readonly type: "string" | "integer" | "number" | "boolean" | "object" | "array";
  readonly format?: string;
  readonly nullable?: boolean;
  readonly enum?: readonly string[];
  readonly description?: string;
  readonly items?: ApiPropertySchema;
}

export interface ApiObjectSchema {
  readonly properties: Readonly<Record<string, ApiPropertySchema>>;
  readonly required?: readonly string[];
}

export interface ApiListQuery {
  readonly limit: number;
  readonly cursor: { readonly createdAt: Date; readonly id: string } | null;
  readonly filters: Readonly<Record<string, string>>;
}

export interface ApiListResult<T> {
  readonly items: readonly T[];
  /** Clé du dernier élément si une page suivante existe. */
  readonly last: { readonly createdAt: Date; readonly id: string } | null;
}

/** Effet d'une ressource : erreurs typées de l'app (mappées en HTTP par `apiRoute`). */
export type ApiEffect<A> = Effect.Effect<A, unknown, AppServices>;

export interface ApiWriteResult<T> {
  readonly status: 200 | 201;
  readonly item: T;
}

export interface ApiActionDefinition<T> {
  readonly name: string;
  readonly description: string;
  readonly run: (tenant: ApiTenant, id: string, body: unknown) => ApiEffect<T>;
}

export interface ApiResourceDefinition<T = unknown> {
  /** Segment d'URL : `/api/v1/{name}` (minuscules, tirets). */
  readonly name: string;
  readonly module: string;
  readonly description: string;
  /** Scope de lecture (ex. `sales:read`). */
  readonly scope: string;
  /** Scope d'écriture, requis pour `create` / `update` / `actions`. */
  readonly writeScope?: string;
  readonly filters: readonly ApiFilterDefinition[];
  readonly schema: ApiObjectSchema;
  /** Schéma du corps accepté par `create` / `update` (OpenAPI). */
  readonly inputSchema?: ApiObjectSchema;
  readonly list: (tenant: ApiTenant, query: ApiListQuery) => ApiEffect<ApiListResult<T>>;
  /** `undefined` = introuvable dans ce tenant (→ 404, jamais 403 : pas de fuite d'existence). */
  readonly get: (tenant: ApiTenant, id: string) => ApiEffect<T | undefined>;
  readonly create?: (tenant: ApiTenant, body: unknown) => ApiEffect<T>;
  readonly update?: (tenant: ApiTenant, id: string, body: unknown) => ApiEffect<T | undefined>;
  readonly actions?: readonly ApiActionDefinition<T>[];
}

/** Ce qu'un module expose à l'API publique et aux webhooks. */
export interface ModuleApiDeclaration {
  readonly module: string;
  readonly resources: readonly ApiResourceDefinition<unknown>[];
  readonly events: readonly Omit<EventDefinition, "module">[];
}

const RESOURCE_NAME = /^[a-z][a-z0-9-]{1,40}$/;
const SCOPE = /^[a-z][a-z_-]*:(read|write)$/;

export function assertApiResourceDefinition(def: ApiResourceDefinition<unknown>): void {
  if (!RESOURCE_NAME.test(def.name)) throw new Error(`Invalid API resource name: ${def.name}`);
  if (!SCOPE.test(def.scope)) throw new Error(`Invalid API scope for ${def.name}: ${def.scope}`);
  if (def.writeScope && !SCOPE.test(def.writeScope)) throw new Error(`Invalid API write scope for ${def.name}: ${def.writeScope}`);
  const writes = !!def.create || !!def.update || (def.actions?.length ?? 0) > 0;
  if (writes && !def.writeScope) throw new Error(`API resource ${def.name} has writes without a writeScope`);
  if (!writes && def.writeScope) throw new Error(`API resource ${def.name} declares a writeScope without writes`);
}
