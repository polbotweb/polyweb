export type TaxonomyNodeId = string;

/** Rejects self-parenting and cycles in any parentId hierarchy. */
export function assertAcyclicParent<T extends { id: TaxonomyNodeId; parentId: TaxonomyNodeId | null }>(
  nodes: readonly T[],
  nodeId: TaxonomyNodeId | null,
  parentId: TaxonomyNodeId | null,
): void {
  if (parentId === null) return;
  if (nodeId !== null && parentId === nodeId) {
    throw new Error("A taxonomy node cannot be its own parent.");
  }

  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const visited = new Set<TaxonomyNodeId>();
  let current: TaxonomyNodeId | null = parentId;

  while (current !== null) {
    if (visited.has(current)) throw new Error("The taxonomy hierarchy contains a cycle.");
    visited.add(current);

    const parent = byId.get(current);
    if (!parent) throw new Error("The taxonomy parent does not exist in the current scope.");
    if (nodeId !== null && parent.id === nodeId) {
      throw new Error("This relation would create a taxonomy cycle.");
    }
    current = parent.parentId;
  }
}
