import type { SearchResourceDefinition } from "./contract";
import { assertSearchResourceDefinition } from "./contract";

const resources = new Map<string, SearchResourceDefinition>();

export function registerSearchResource(definition: SearchResourceDefinition): void {
  assertSearchResourceDefinition(definition);
  if (resources.has(definition.resourceId)) {
    throw new Error(`Search resource already registered: ${definition.resourceId}`);
  }
  resources.set(definition.resourceId, definition);
}

export function getSearchResource(resourceId: string): SearchResourceDefinition | undefined {
  return resources.get(resourceId);
}

export function listSearchResources(): readonly SearchResourceDefinition[] {
  return [...resources.values()];
}

export function clearSearchResourcesForTests(): void {
  resources.clear();
}
