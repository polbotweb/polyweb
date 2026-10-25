import { eq, asc, and } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { cached } from "@database/cache";
import { navigationMenus, navigationItems } from "@database/schemas";
import { isValidLocale } from "@i18n/utils";
import type { DbError } from "@/lib/effect/errors";
import { dbTry, runOrThrow } from "@/lib/effect/run";

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

/** Conteneur de menu par nom (null si inconnu). */
const menuByNameEffect = (menuName: string) =>
  dbTry("nav.menuByName", () =>
    getDrizzle().select().from(navigationMenus).where(eq(navigationMenus.name, menuName)).limit(1),
  ).pipe(Effect.map(([row]) => row ?? null));

/**
 * Menu par nom et locale en arbre hiérarchique (racines = parentId null, enfants imbriqués,
 * cycles et profondeur contrôlés). Menu inconnu ou masqué → arbre vide.
 */
const menuEffect = (menuName: string, locale: string): Effect.Effect<NavTreeItem[], DbError> =>
  !isValidLocale(locale)
    ? Effect.succeed([])
    : Effect.gen(function* () {
        const menu = yield* menuByNameEffect(menuName);
        if (!menu || !menu.isVisible) return [];
        const items = yield* dbTry("nav.items", () =>
          getDrizzle()
            .select()
            .from(navigationItems)
            .where(and(eq(navigationItems.menuId, menu.id), eq(navigationItems.locale, locale), eq(navigationItems.isActive, true)))
            .orderBy(asc(navigationItems.sortOrder))
            .limit(500),
        );
        return buildNavTree(items);
      });

/** Load a navigation menu by name and locale, returning a hierarchical tree (cached). */
export const getMenu = cached(
  (menuName: string, locale: string) => `nav:${menuName}:${locale}`,
  (menuName: string, locale: string): Promise<NavTreeItem[]> => runOrThrow(menuEffect(menuName, locale)),
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

const menusListEffect = (): Effect.Effect<NavMenu[], DbError> =>
  dbTry("nav.menus", () => getDrizzle().select().from(navigationMenus).orderBy(asc(navigationMenus.name)).limit(100));

/** Lectures navigation Effect-natives (non mises en cache ; les exports Promise le sont). */
export const navigationLoaderEffects = {
  getMenu: menuEffect,
  getMenusList: menusListEffect,
  getMenuMeta: (menuName: string): Effect.Effect<NavMenu | null, DbError> => menuByNameEffect(menuName),
};

/** List all navigation menus (for admin UI). */
export const getMenusList = cached(
  () => "nav:menus",
  (): Promise<NavMenu[]> => runOrThrow(menusListEffect()),
);

/** Get a single menu's metadata by name (for BaseLayout heading logic). */
export const getMenuMeta = cached(
  (menuName: string) => `nav:meta:${menuName}`,
  (menuName: string): Promise<NavMenu | null> => runOrThrow(menuByNameEffect(menuName)),
);
