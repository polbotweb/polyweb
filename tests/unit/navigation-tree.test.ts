import { describe, it, expect } from 'vitest';
import { buildNavTree } from '@database/loaders/navigation.loader';

function item(id: string, parentId: string | null = null, label = id) {
  return { id, parentId, label, url: null, icon: null, showIcon: false, openInNewTab: false };
}

describe('buildNavTree', () => {
  it('builds a simple parent-child hierarchy', () => {
    const items = [item('a'), item('b', 'a')];
    const roots = buildNavTree(items);

    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('a');
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].id).toBe('b');
  });

  it('handles multiple root items', () => {
    const items = [item('a'), item('b'), item('c')];
    const roots = buildNavTree(items);

    expect(roots).toHaveLength(3);
  });

  it('detects self-referencing cycle and promotes to root', () => {
    const items = [item('a', 'a')];
    const roots = buildNavTree(items);

    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('a');
    expect(roots[0].children).toHaveLength(0);
  });

  it('detects A→B→A cycle and promotes both to root', () => {
    const items = [item('a', 'b'), item('b', 'a')];
    const roots = buildNavTree(items);

    // Both nodes should be promoted to root (cycle broken)
    expect(roots).toHaveLength(2);
    const rootIds = roots.map(r => r.id).sort();
    expect(rootIds).toEqual(['a', 'b']);
    // Neither should have children (cycle is broken, not nested)
    for (const root of roots) {
      expect(root.children).toHaveLength(0);
    }
  });

  it('handles orphan parentId (parent not in list) gracefully', () => {
    const items = [item('a', 'missing')];
    const roots = buildNavTree(items);

    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('a');
  });

  it('builds deep nesting correctly', () => {
    const items = [item('a'), item('b', 'a'), item('c', 'b')];
    const roots = buildNavTree(items);

    expect(roots).toHaveLength(1);
    expect(roots[0].children[0].children[0].id).toBe('c');
  });

  it('returns empty array for empty input', () => {
    expect(buildNavTree([])).toEqual([]);
  });

  it('detects A→B→C→A three-node cycle and promotes all to root', () => {
    const items = [item('a', 'c'), item('b', 'a'), item('c', 'b')];
    const roots = buildNavTree(items);

    // All three nodes are in a cycle — each should be promoted to root
    const rootIds = roots.map(r => r.id).sort();
    expect(rootIds).toEqual(['a', 'b', 'c']);
    // None should have children (cycle fully broken)
    for (const root of roots) {
      expect(root.children).toHaveLength(0);
    }
  });

  it('handles long chain without cycle (no false positive)', () => {
    // a → b → c → d → e: linear chain, no cycle
    const items = [item('a'), item('b', 'a'), item('c', 'b'), item('d', 'c'), item('e', 'd')];
    const roots = buildNavTree(items);

    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('a');
    // Walk down the chain
    let node = roots[0];
    for (const expected of ['b', 'c', 'd', 'e']) {
      expect(node.children).toHaveLength(1);
      node = node.children[0];
      expect(node.id).toBe(expected);
    }
    expect(node.children).toHaveLength(0);
  });

  it('handles mixed: some nodes in cycle, some healthy', () => {
    // Cycle: x → y → x | Healthy tree: a → b
    const items = [item('a'), item('b', 'a'), item('x', 'y'), item('y', 'x')];
    const roots = buildNavTree(items);

    const rootIds = roots.map(r => r.id).sort();
    expect(rootIds).toEqual(['a', 'x', 'y']);
    // 'a' should still have 'b' as child
    const a = roots.find(r => r.id === 'a')!;
    expect(a.children).toHaveLength(1);
    expect(a.children[0].id).toBe('b');
  });
});
