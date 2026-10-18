import { describe, it, expect } from 'vitest';
import { buildNavTree } from '@/database/loaders/navigation.loader';
import { isValidLocale } from '@/i18n/utils';

/**
 * Unit tests for database loaders — non-DB logic (P3.14).
 * Tests buildNavTree (pure function) and isValidLocale guard used by loaders.
 */

describe('buildNavTree', () => {
  const base = { url: '/test', icon: null, showIcon: false, openInNewTab: false };

  it('returns roots for items without parentId', () => {
    const items = [
      { id: '1', parentId: null, label: 'Home', ...base },
      { id: '2', parentId: null, label: 'About', ...base },
    ];
    const tree = buildNavTree(items);
    expect(tree).toHaveLength(2);
    expect(tree[0].label).toBe('Home');
    expect(tree[1].label).toBe('About');
  });

  it('nests children under their parent', () => {
    const items = [
      { id: '1', parentId: null, label: 'Products', ...base },
      { id: '2', parentId: '1', label: 'Widget A', ...base },
      { id: '3', parentId: '1', label: 'Widget B', ...base },
    ];
    const tree = buildNavTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].label).toBe('Widget A');
  });

  it('handles deep nesting (3 levels)', () => {
    const items = [
      { id: '1', parentId: null, label: 'L1', ...base },
      { id: '2', parentId: '1', label: 'L2', ...base },
      { id: '3', parentId: '2', label: 'L3', ...base },
    ];
    const tree = buildNavTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].children[0].label).toBe('L3');
  });

  it('detects cycles and promotes cyclic items to root', () => {
    // A → B → A cycle
    const items = [
      { id: 'a', parentId: 'b', label: 'A', ...base },
      { id: 'b', parentId: 'a', label: 'B', ...base },
    ];
    const tree = buildNavTree(items);
    // Both should end up as roots (no infinite loop)
    expect(tree.length).toBeGreaterThanOrEqual(1);
    expect(tree.length).toBeLessThanOrEqual(2);
  });

  it('orphaned parentId (parent not in list) promotes to root', () => {
    const items = [
      { id: '1', parentId: 'nonexistent', label: 'Orphan', ...base },
    ];
    const tree = buildNavTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0].label).toBe('Orphan');
  });

  it('returns empty array for empty input', () => {
    expect(buildNavTree([])).toEqual([]);
  });
});

describe('isValidLocale guard (used by all loaders)', () => {
  it('accepts valid locales', () => {
    expect(isValidLocale('fr')).toBe(true);
    expect(isValidLocale('en')).toBe(true);
    expect(isValidLocale('es')).toBe(true);
    expect(isValidLocale('ar')).toBe(true);
  });

  it('rejects invalid locales', () => {
    expect(isValidLocale('de')).toBe(false);
    expect(isValidLocale('')).toBe(false);
    expect(isValidLocale(undefined)).toBe(false);
    expect(isValidLocale('FR')).toBe(false);
  });

  it('rejects SQL injection attempts', () => {
    expect(isValidLocale("fr' OR 1=1--")).toBe(false);
    expect(isValidLocale("'; DROP TABLE users;--")).toBe(false);
  });
});
