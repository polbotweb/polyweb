/** Capabilities that a first-class Polyweb module may opt into. */
import type { SearchResourceDefinition } from "@/core/search";

export interface PolywebModuleCapabilities {
  content: boolean;
  localization: boolean;
  media: boolean;
  seo: boolean;
  taxonomy: boolean;
  attributes: boolean;
  search: boolean;
  publication: boolean;
  revisions: boolean;
  locks: boolean;
  engagement: boolean;
  moderation: boolean;
  notifications: boolean;
  audit: boolean;
  cache: boolean;
}

export interface PolywebModuleCapabilityProviders {
  readonly content: string;
  readonly localization: string;
  readonly media: string;
  readonly seo: string;
  readonly taxonomy: string;
  readonly attributes: string;
  readonly search: string;
  readonly publication: string;
  readonly revisions: string;
  readonly locks: string;
  readonly engagement: string;
  readonly moderation: string;
  readonly notifications: string;
  readonly audit: string;
  readonly cache: string;
}

export interface PolywebModulePresentations {
  readonly card: readonly string[];
  readonly list: readonly string[];
  readonly single: readonly string[];
  readonly ui: readonly string[];
}

export interface PolywebModuleDefinition {
  readonly id: string;
  readonly entity: string;
  readonly capabilities: Readonly<PolywebModuleCapabilities>;
  readonly capabilityProviders: Readonly<PolywebModuleCapabilityProviders>;
  readonly presentations: Readonly<PolywebModulePresentations>;
  readonly searchDefinition?: Readonly<SearchResourceDefinition>;
}

export type ModuleCapability = keyof PolywebModuleCapabilities;

export function defineModuleCapabilities<const T extends PolywebModuleCapabilities>(capabilities: T): Readonly<T> { return capabilities; }
export function defineModuleCapabilityProviders<const T extends PolywebModuleCapabilityProviders>(providers: T): Readonly<T> { return providers; }
export function defineModulePresentations<const T extends PolywebModulePresentations>(presentations: T): Readonly<T> { return presentations; }

export function assertModuleCapabilityProviders(module: PolywebModuleDefinition): void {
  for (const capability of Object.keys(module.capabilities) as ModuleCapability[]) {
    if (module.capabilities[capability] && !module.capabilityProviders[capability]) throw new Error(`Module ${module.id} enables ${capability} without a concrete provider.`);
  }
  if (module.capabilities.search && !module.searchDefinition) throw new Error(`Module ${module.id} enables search without a search definition.`);
  if (!module.capabilities.search && module.searchDefinition) throw new Error(`Module ${module.id} declares a search definition without enabling search.`);
  if (module.searchDefinition && !module.searchDefinition.resourceId.trim()) throw new Error(`Module ${module.id} search definition must have a non-empty resource id.`);
}