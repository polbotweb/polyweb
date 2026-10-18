export type SearchFieldKind = "text" | "keyword" | "number" | "date" | "boolean";

export interface SearchFieldDefinition {
  readonly name: string;
  readonly kind: SearchFieldKind;
  readonly searchable?: boolean;
  readonly filterable?: boolean;
  readonly sortable?: boolean;
}

export interface SearchResourceDefinition {
  readonly resourceId: string;
  readonly fields: readonly SearchFieldDefinition[];
  readonly defaultSort?: string;
}

export function assertSearchResourceDefinition(definition: SearchResourceDefinition): void {
  const names = new Set<string>();
  for (const field of definition.fields) {
    if (!field.name.trim()) throw new Error("Search field name cannot be empty");
    if (names.has(field.name)) throw new Error(`Duplicate search field: ${field.name}`);
    names.add(field.name);
  }
  if (definition.defaultSort && !names.has(definition.defaultSort)) {
    throw new Error(`Unknown default sort field: ${definition.defaultSort}`);
  }
}
