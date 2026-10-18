/**
 * État de sélection d'une liste admin (pur, sans DOM) — partagé par tous les modules.
 * La sélection « page courante » est explicite : jamais de sélection implicite de résultats invisibles.
 */
export interface BulkSelection {
  readonly ids: ReadonlySet<string>;
  readonly max: number;
}

export const emptySelection = (max = 100): BulkSelection => ({ ids: new Set(), max });

export function toggle(selection: BulkSelection, id: string): BulkSelection {
  const ids = new Set(selection.ids);
  if (ids.has(id)) ids.delete(id);
  else if (ids.size < selection.max) ids.add(id);
  return { ...selection, ids };
}

/** Coche/décoche toute la page visible (bornée par `max`). */
export function togglePage(selection: BulkSelection, pageIds: readonly string[]): BulkSelection {
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selection.ids.has(id));
  const ids = new Set(selection.ids);
  if (allSelected) for (const id of pageIds) ids.delete(id);
  else for (const id of pageIds) { if (ids.size >= selection.max) break; ids.add(id); }
  return { ...selection, ids };
}

export const clear = (selection: BulkSelection): BulkSelection => ({ ...selection, ids: new Set() });

/** État de la case « tout » : true / false / "mixed" (aria-checked). */
export function pageCheckState(selection: BulkSelection, pageIds: readonly string[]): boolean | "mixed" {
  const n = pageIds.filter((id) => selection.ids.has(id)).length;
  return n === 0 ? false : n === pageIds.length ? true : "mixed";
}

export const selectedIds = (selection: BulkSelection): string[] => [...selection.ids];
