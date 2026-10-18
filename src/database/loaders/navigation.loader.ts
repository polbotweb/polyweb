import { eq, asc, and } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { cached } from "@database/cache";
import { navigationMenus, navigationItems } from "@database/schemas";
import { isValidLocale } from "@i18n/utils";

export interface NavMenu {
  id: string;
  name: string;
  description: string | null;
  isVisible: boolean;
  displayLabel: string | null;
  showHeading: boolean;
}

export interface NavTreeItem {
  id: string;
  label: string;
  url: string | null;
  icon: string | null;
  showIcon: boolean;
  openInNewTab: boolean;
  children: NavTreeItem[];
}

/**
 * Load a navigation menu by name and locale, returning a hierarchical tree.
 * Top-level items (parentId = null) are returned with their children nested.
 */
export const getMenu = cached(
  (menuName: string, locale: string) => `nav:${menuName}:${locale}`,
  async (
    menuName: string,
    locale: string,
  ): Promise<NavTreeItem[]> => {
  if (!isValidLocale(locale)) return [];
  const db = getDrizzle();

  // Find the menu container
  const [menu] = await db
    .select()
    .from(navigationMenus)
    .where(eq(navigationMenus.name, menuName))
    .limit(1);

  if (!menu) return [];

  // If menu is hidden, return empty tree
  if (!menu.isVisible) return [];

  // Fetch all items for this menu + locale (flat)
  const items = await db
    .select()
    .from(navigationItems)
    .where(
      and(
        eq(navigationItems.menuId, menu.id),
        eq(navigationItems.locale, locale),
        eq(navigationItems.isActive, true),
      ),
    )
    .orderBy(asc(navigationItems.sortOrder))
    .limit(500);

  // Build tree from flat list (with cycle detection)
  return buildNavTree(items);
  },
);

const MAX_NAV_DEPTH = 10;

/** Build a hierarchical tree from a flat list of navigation items. Exported for testing. */
export function buildNavTree(
  items: { id: string; parentId: string | null; label: string; url: string | null; icon: string | null; showIcon: boolean; openInNewTab: boolean }[],
): NavTreeItem[] {
  const itemMap = new Map<string, NavTreeItem>();
  const roots: NavTreeItem[] = [];

  for (const item of items) {
    itemMap.set(item.id, {
      id: item.id,
      label: item.label,
      url: item.url,
      icon: item.icon,
      showIcon: item.showIcon,
      openInNewTab: item.openInNewTab,
      children: [],
    });
  }

  const parentLookup = new Map(items.map(i => [i.id, i.parentId]));

  for (const item of items) {
    const node = itemMap.get(item.id)!;
    if (item.parentId && itemMap.has(item.parentId)) {
      // Walk up the ancestor chain to detect cycles
      let cyclic = false;
      const visited = new Set<string>([item.id]);
      let current: string | null = item.parentId;
      while (current) {
        if (visited.has(current)) { cyclic = true; break; }
        visited.add(current);
        current = parentLookup.get(current) ?? null;
      }
      if (cyclic) {
        console.warn(`[nav] Cycle detected for navigation item "${item.id}" (label: "${item.label}") — treated as root.`);
        roots.push(node);
      } else {
        itemMap.get(item.parentId)!.children.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  // Enforce depth limit to prevent overly deep trees from causing issues
  function trimDepth(nodes: NavTreeItem[], depth: number): void {
    for (const node of nodes) {
      if (depth >= MAX_NAV_DEPTH) {
        if (node.children.length > 0) {
          console.warn(`[nav] Navigation tree depth exceeds ${MAX_NAV_DEPTH} — trimming children of "${node.label}".`);
          node.children = [];
        }
      } else {
        trimDepth(node.children, depth + 1);
      }
    }
  }
  trimDepth(roots, 1);

  return roots;
}

/**
 * List all navigation menus (for admin UI).
 */
export const getMenusList = cached(
  () => "nav:menus",
  async (): Promise<NavMenu[]> => {
    const db = getDrizzle();
    return db.select().from(navigationMenus).orderBy(asc(navigationMenus.name)).limit(100);
  },
);

/**
 * Get a single menu's metadata by name (for BaseLayout heading logic).
 */
export const getMenuMeta = cached(
  (menuName: string) => `nav:meta:${menuName}`,
  async (menuName: string): Promise<NavMenu | null> => {
    const db = getDrizzle();
    const [row] = await db
      .select()
      .from(navigationMenus)
      .where(eq(navigationMenus.name, menuName))
      .limit(1);
    return row ?? null;
  },
);
