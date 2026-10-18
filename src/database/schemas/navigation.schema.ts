import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  uniqueIndex,
  index,
  type AnyPgColumn,
  check,
} from "drizzle-orm/pg-core";

// ─── Navigation Menus ────────────────────────────────────────────────────────
// Containers: header, footer_primary, footer_secondary, footer_legal.
export const navigationMenus = pgTable(
  "navigation_menus",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    description: text("description"),
    isVisible: boolean("is_visible").default(true).notNull(),
    displayLabel: text("display_label"),
    showHeading: boolean("show_heading").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("navigation_menus_name_uidx").on(table.name)],
);

// ─── Navigation Items ────────────────────────────────────────────────────────
// Hierarchical (parent/child). One row per item × locale.
export const navigationItems = pgTable(
  "navigation_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    menuId: text("menu_id")
      .notNull()
      .references(() => navigationMenus.id, { onDelete: "cascade" }),
    parentId: text("parent_id")
      .references((): AnyPgColumn => navigationItems.id, { onDelete: "set null" }),
    locale: text("locale").notNull(),
    label: text("label").notNull(),
    url: text("url"),
    icon: text("icon"),
    showIcon: boolean("show_icon").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    openInNewTab: boolean("open_in_new_tab").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("nav_items_menuId_idx").on(table.menuId),
    index("nav_items_parentId_idx").on(table.parentId),
    index("nav_items_menu_locale_idx").on(
      table.menuId,
      table.locale,
      table.sortOrder,
    ),
    check("nav_items_no_self_parent", sql`${table.parentId} IS NULL OR ${table.parentId} != ${table.id}`),
  ],
);

// ─── Relations ───────────────────────────────────────────────────────────────

export const navigationMenusRelations = relations(
  navigationMenus,
  ({ many }) => ({
    items: many(navigationItems),
  }),
);

export const navigationItemsRelations = relations(
  navigationItems,
  ({ one, many }) => ({
    menu: one(navigationMenus, {
      fields: [navigationItems.menuId],
      references: [navigationMenus.id],
    }),
    parent: one(navigationItems, {
      fields: [navigationItems.parentId],
      references: [navigationItems.id],
      relationName: "parentChild",
    }),
    children: many(navigationItems, {
      relationName: "parentChild",
    }),
  }),
);
