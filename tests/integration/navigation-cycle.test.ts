import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { getDrizzle } from '@database/drizzle';
import { navigationMenus, navigationItems } from '@database/schemas';
import { eq } from 'drizzle-orm';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) {
      super(message);
      this.code = code;
    }
  }
  return { ActionError, defineAction: (def: any) => def };
});

import { assertNoCycle } from '@/actions/admin/navigation';

/**
 * Integration tests for assertNoCycle — requires a real DB connection.
 * Tests the graph-walking cycle detection logic that prevents circular
 * parent references in the navigation hierarchy.
 */
describe('assertNoCycle — navigation hierarchy', () => {
  const db = getDrizzle();
  let menuId: string;
  const createdItemIds: string[] = [];

  beforeAll(async () => {
    // Create a test menu
    const [menu] = await db.insert(navigationMenus).values({
      name: `test-cycle-${Date.now()}`,
      description: 'Cycle detection test menu',
    }).returning();
    menuId = menu.id;
  });

  afterAll(async () => {
    // Cleanup: delete items then menu
    for (const id of createdItemIds) {
      await db.delete(navigationItems).where(eq(navigationItems.id, id)).catch(() => {});
    }
    if (menuId) {
      await db.delete(navigationMenus).where(eq(navigationMenus.id, menuId)).catch(() => {});
    }
  });

  async function createItem(parentId: string | null = null, label = 'item') {
    const [item] = await db.insert(navigationItems).values({
      menuId,
      parentId,
      locale: 'fr',
      label,
      sortOrder: 0,
    }).returning();
    createdItemIds.push(item.id);
    return item;
  }

  it('throws when item is its own parent', async () => {
    const item = await createItem();
    await expect(assertNoCycle(db, item.id, item.id)).rejects.toThrow(
      /propre parent/,
    );
  });

  it('allows a valid parent-child relationship', async () => {
    const parent = await createItem();
    const child = await createItem(parent.id);
    const grandchild = await createItem(child.id);
    // Moving grandchild under parent is valid (no cycle)
    await expect(assertNoCycle(db, grandchild.id, parent.id)).resolves.toBeUndefined();
  });

  it('detects A→B→A cycle', async () => {
    const a = await createItem();
    const b = await createItem(a.id);
    // Trying to make A's parent = B creates A→B→A
    await expect(assertNoCycle(db, a.id, b.id)).rejects.toThrow(
      /circulaire/,
    );
  });

  it('detects A→B→C→A three-node cycle', async () => {
    const a = await createItem();
    const b = await createItem(a.id);
    const c = await createItem(b.id);
    // Trying to make A's parent = C creates A→C→B→A
    await expect(assertNoCycle(db, a.id, c.id)).rejects.toThrow(
      /circulaire/,
    );
  });

  it('allows reassigning parent to a non-ancestor node', async () => {
    const a = await createItem();
    const b = await createItem();
    const c = await createItem(a.id);
    // Moving C under B is valid (B is not a descendant of C)
    await expect(assertNoCycle(db, c.id, b.id)).resolves.toBeUndefined();
  });

  it('handles parentId pointing to non-existent item (no crash)', async () => {
    const item = await createItem();
    // Non-existent parent terminates the walk (parent lookup returns null)
    await expect(assertNoCycle(db, item.id, 'non-existent-id')).resolves.toBeUndefined();
  });
});
