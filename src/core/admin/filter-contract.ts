export type AdminFilterKind = "search" | "select" | "multi-select" | "boolean" | "date" | "number-range";

export interface AdminResourceFilterDefinition {
  readonly id: string;
  readonly kind: AdminFilterKind;
  readonly queryParam: string;
  readonly multiple?: boolean;
}

export interface AdminResourceSortDefinition {
  readonly id: string;
  readonly queryParam: string;
  readonly directions: readonly ("asc" | "desc")[];
}

export interface AdminResourceBulkActionDefinition {
  readonly id: string;
  readonly permission?: string;
  readonly destructive?: boolean;
  readonly confirmationKey?: string;
}

export interface AdminResourceListDefinition {
  readonly filters?: readonly AdminResourceFilterDefinition[];
  readonly sorts?: readonly AdminResourceSortDefinition[];
  readonly defaultSort?: string;
  readonly selection?: boolean;
  readonly facets?: boolean;
  readonly savedViews?: boolean;
  readonly bulkActions?: readonly AdminResourceBulkActionDefinition[];
}

export function assertAdminResourceListDefinition(definition: AdminResourceListDefinition): void {
  const filterIds = new Set<string>();
  for (const filter of definition.filters ?? []) {
    if (!filter.id.trim() || !filter.queryParam.trim()) throw new Error("Admin filter requires id and queryParam");
    if (filterIds.has(filter.id)) throw new Error(`Duplicate admin filter: ${filter.id}`);
    filterIds.add(filter.id);
  }

  const sortIds = new Set<string>();
  for (const sort of definition.sorts ?? []) {
    if (!sort.id.trim() || !sort.queryParam.trim()) throw new Error("Admin sort requires id and queryParam");
    if (sort.directions.length === 0) throw new Error(`Sort ${sort.id} must define at least one direction`);
    if (sortIds.has(sort.id)) throw new Error(`Duplicate admin sort: ${sort.id}`);
    sortIds.add(sort.id);
  }

  if (definition.defaultSort && !sortIds.has(definition.defaultSort)) {
    throw new Error(`Unknown default admin sort: ${definition.defaultSort}`);
  }

  const actionIds = new Set<string>();
  for (const action of definition.bulkActions ?? []) {
    if (!action.id.trim()) throw new Error("Admin bulk action requires an id");
    if (actionIds.has(action.id)) throw new Error(`Duplicate admin bulk action: ${action.id}`);
    actionIds.add(action.id);
  }

  if ((definition.bulkActions?.length ?? 0) > 0 && definition.selection !== true) {
    throw new Error("Admin bulk actions require selection capability.");
  }
}
