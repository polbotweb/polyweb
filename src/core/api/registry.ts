/** Registre des ressources de l'API publique (même patron que `core/search/registry`). */
import { API_SCOPES } from "@database/schemas/api.schema";
import { registerEventNames } from "@/core/events";
import { assertApiResourceDefinition, type ApiResourceDefinition, type ModuleApiDeclaration } from "./contract";

const resources = new Map<string, ApiResourceDefinition<unknown>>();
/** Segments déjà servis par des routes statiques de `/api/v1`. */
const RESERVED = new Set(["content", "content-types", "forms", "search", "openapi.json"]);

export function registerApiResource(definition: ApiResourceDefinition<unknown>): void {
  assertApiResourceDefinition(definition);
  if (RESERVED.has(definition.name)) throw new Error(`API resource name is reserved: ${definition.name}`);
  if (resources.has(definition.name)) throw new Error(`API resource already registered: ${definition.name}`);
  resources.set(definition.name, definition);
}

export function getApiResource(name: string): ApiResourceDefinition<unknown> | undefined {
  return resources.get(name);
}

export function listApiResources(): readonly ApiResourceDefinition<unknown>[] {
  return [...resources.values()];
}

/** Scopes attribuables à une clé : cœur + scopes déclarés par les ressources, sans doublon. */
export function listApiScopes(): readonly string[] {
  const out = new Set<string>(API_SCOPES);
  for (const r of resources.values()) {
    out.add(r.scope);
    if (r.writeScope) out.add(r.writeScope);
  }
  return [...out];
}

/** Enregistre les ressources et événements déclarés par un module. */
export function registerModuleApi(declaration: ModuleApiDeclaration): void {
  for (const r of declaration.resources) {
    if (r.module !== declaration.module) throw new Error(`API resource ${r.name} declared by ${declaration.module} but owned by ${r.module}`);
    registerApiResource(r);
  }
  registerEventNames(declaration.events.map((e) => ({ ...e, module: declaration.module })));
}

export function clearApiResourcesForTests(): void {
  resources.clear();
}
