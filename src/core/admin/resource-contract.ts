import type { AtomicModuleDefinition } from "@/core/modules";
import type { AdminResourceListDefinition } from "@/core/admin/filter-contract";

export type ResourceAction =
  | "create"
  | "read"
  | "update"
  | "duplicate"
  | "publish"
  | "unpublish"
  | "archive"
  | "restore"
  | "delete";

export interface ResourcePresentationVariants {
  readonly card?: readonly string[];
  readonly list?: readonly string[];
  readonly single?: readonly string[];
}

export interface ResourceManagementCapabilities {
  readonly list?: boolean;
  readonly search?: boolean;
  readonly filters?: boolean;
  readonly sort?: boolean;
  readonly pagination?: boolean;
  readonly stats?: boolean;
  readonly selection?: boolean;
  readonly facets?: boolean;
  readonly savedViews?: boolean;
}

export interface ResourceActionCapabilities {
  readonly create?: boolean;
  readonly read?: boolean;
  readonly update?: boolean;
  readonly duplicate?: boolean;
  readonly publish?: boolean;
  readonly unpublish?: boolean;
  readonly archive?: boolean;
  readonly restore?: boolean;
  readonly delete?: boolean;
  readonly bulk?: boolean;
}

export interface AdminResourceDefinition {
  readonly id: string;
  readonly entity: string;
  readonly management: Readonly<ResourceManagementCapabilities>;
  readonly actions: Readonly<ResourceActionCapabilities>;
  readonly presentation?: Readonly<ResourcePresentationVariants>;
  readonly list?: Readonly<AdminResourceListDefinition>;
  readonly permissionNamespace?: string;
}

const ACTION_CAPABILITY_REQUIREMENTS: Readonly<Partial<Record<keyof ResourceActionCapabilities, keyof AtomicModuleDefinition["capabilities"]>>> = {
  publish: "publication",
  unpublish: "publication",
  archive: "publication",
  restore: "publication",
};

export function assertResourceCompatibility(module: AtomicModuleDefinition, resource: AdminResourceDefinition): void {
  const management = resource.management ?? {};
  const actions = resource.actions ?? {};

  if (module.entity !== resource.entity) {
    throw new Error(`Resource ${resource.id} targets ${resource.entity}, but module ${module.id} owns ${module.entity}.`);
  }

  for (const [action, capability] of Object.entries(ACTION_CAPABILITY_REQUIREMENTS)) {
    if (actions[action as keyof ResourceActionCapabilities] === true && module.capabilities[capability as keyof AtomicModuleDefinition["capabilities"]] !== true) {
      throw new Error(`Resource ${resource.id} enables ${action}, but module ${module.id} does not enable ${capability}.`);
    }
  }

  if (management.filters && !management.list) throw new Error(`Resource ${resource.id} enables filters without list capability.`);
  if (management.search && !management.list) throw new Error(`Resource ${resource.id} enables search without list capability.`);
  if (management.sort && !management.list) throw new Error(`Resource ${resource.id} enables sort without list capability.`);
  if (management.pagination && !management.list) throw new Error(`Resource ${resource.id} enables pagination without list capability.`);
  if (management.selection && !management.list) throw new Error(`Resource ${resource.id} enables selection without list capability.`);
  if (management.facets && !management.filters) throw new Error(`Resource ${resource.id} enables facets without filters capability.`);
  if (management.savedViews && !management.list) throw new Error(`Resource ${resource.id} enables saved views without list capability.`);
  if (actions.bulk && !management.selection) throw new Error(`Resource ${resource.id} enables bulk actions without selection capability.`);
  if (resource.list?.defaultSort && !management.sort) throw new Error(`Resource ${resource.id} defines a default sort without sort capability.`);
  if (resource.list && !management.list) throw new Error(`Resource ${resource.id} defines list configuration without list capability.`);
  if ((resource.list?.bulkActions?.length ?? 0) > 0 && actions.bulk !== true) throw new Error(`Resource ${resource.id} defines bulk actions without bulk capability.`);
}
