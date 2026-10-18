import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, inArray } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { navigationItems, navigationMenus } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { assertPermission, adminRateLimit, auditAdmin } from "./_helpers";
import { LOCALES } from "@i18n/config";
import type { DrizzleDB } from "@database/drizzle";

/** Walk up the parent chain to detect circular references (with depth limit). */
export async function assertNoCycle(
  db: DrizzleDB | Parameters<Parameters<DrizzleDB['transaction']>[0]>[0],
  itemId: string,
  parentId: string,
): Promise<void> {
  if (parentId === itemId) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message: "Un élément de navigation ne peut pas être son propre parent.",
    });
  }
  const MAX_DEPTH = 10;
  let currentParentId: string | null = parentId;
  const visited = new Set<string>([itemId]);
  let depth = 0;
  while (currentParentId) {
    if (visited.has(currentParentId)) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Référence circulaire détectée dans la hiérarchie de navigation.",
      });
    }
    depth++;
    if (depth > MAX_DEPTH) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: `La hiérarchie de navigation ne peut pas dépasser ${MAX_DEPTH} niveaux.`,
      });
    }
    visited.add(currentParentId);
    const [parent] = await db
      .select({ parentId: navigationItems.parentId })
      .from(navigationItems)
      .where(eq(navigationItems.id, currentParentId))
      .limit(1);
    currentParentId = parent?.parentId ?? null;
  }
}

const localeEnum = z.enum(LOCALES, {
  message: `La locale doit être l'une des suivantes : ${LOCALES.join(", ")}.`,
});

const navItemBase = z.object({
  menuId: z.string().min(1, "L'identifiant du menu est requis."),
  parentId: z.string().nullable().optional(),
  locale: localeEnum,
  label: z
    .string()
    .trim()
    .min(1, "Le libellé est requis.")
    .max(100, "Le libellé ne peut pas dépasser 100 caractères."),
  url: z
    .string()
    .trim()
    .max(500, "L'URL ne peut pas dépasser 500 caractères.")
    .refine(
      (v) => !v || /^(https?:\/\/|\/|#|mailto:[^\s@]+@[^\s@]+\.[^\s@]+)/.test(v),
      "L'URL doit commencer par http://, https://, /, # ou mailto:user@example.com"
    )
    .nullable()
    .optional(),
  icon: z
    .string()
    .trim()
    .max(50, "L'icône ne peut pas dépasser 50 caractères.")
    .nullable()
    .optional(),
  showIcon: z.boolean().optional(),
  sortOrder: z
    .number()
    .int("L'ordre doit être un nombre entier.")
    .min(0, "L'ordre doit être positif.")
    .optional(),
  isActive: z.boolean().optional(),
  openInNewTab: z.boolean().optional(),
});

export const createNavigationItem = defineAction({
  input: navItemBase,
  handler: async (input, context) => {
    const user = await assertPermission(context, { navigation: ["update"] });
    adminRateLimit(context, user.id, "nav");

    const db = getDrizzle();

    // Vérifier que le menu existe
    const [menu] = await db
      .select({ id: navigationMenus.id })
      .from(navigationMenus)
      .where(eq(navigationMenus.id, input.menuId))
      .limit(1);

    if (!menu) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Le menu spécifié n'existe pas.",
      });
    }

    // Vérifier que le parent existe et appartient au même menu
    if (input.parentId) {
      const [parent] = await db
        .select({ id: navigationItems.id })
        .from(navigationItems)
        .where(and(eq(navigationItems.id, input.parentId), eq(navigationItems.menuId, input.menuId)))
        .limit(1);

      if (!parent) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "L'élément parent spécifié n'existe pas ou n'appartient pas au même menu.",
        });
      }
    }

    const [created] = await db
      .insert(navigationItems)
      .values(input)
      .returning();

    auditAdmin(context, user.id, "NAVIGATION_ITEM_CREATE", {
      resource: "navigation_items",
      resourceId: created.id,
      metadata: { menuId: created.menuId, label: created.label },
    });

    invalidateCache("nav:");
    return created;
  },
});

export const updateNavigationItem = defineAction({
  input: navItemBase.partial().extend({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { navigation: ["update"] });
    adminRateLimit(context, user.id, "nav");

    const { id, ...data } = input;
    const db = getDrizzle();

    const [updated] = await db.transaction(async (tx) => {
      // Detect circular reference when changing parentId (inside transaction)
      if (data.parentId !== undefined && data.parentId !== null) {
        await assertNoCycle(tx, id, data.parentId);
      }

      return tx
        .update(navigationItems)
        .set(data)
        .where(eq(navigationItems.id, id))
        .returning();
    });

    if (!updated) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Élément de navigation introuvable.",
      });
    }

    auditAdmin(context, user.id, "NAVIGATION_ITEM_UPDATE", {
      resource: "navigation_items",
      resourceId: id,
      metadata: { label: updated.label },
    });

    invalidateCache("nav:");
    return updated;
  },
});

export const deleteNavigationItem = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { navigation: ["update"] });
    adminRateLimit(context, user.id, "nav");

    const db = getDrizzle();
    const [deleted] = await db
      .delete(navigationItems)
      .where(eq(navigationItems.id, input.id))
      .returning({ id: navigationItems.id, label: navigationItems.label });

    if (!deleted) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Élément de navigation introuvable.",
      });
    }

    auditAdmin(context, user.id, "NAVIGATION_ITEM_DELETE", {
      resource: "navigation_items",
      resourceId: input.id,
      metadata: { label: deleted.label },
    });

    invalidateCache("nav:");
    return { success: true as const };
  },
});

export const reorderNavigationItems = defineAction({
  input: z.object({
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          sortOrder: z.number().int().min(0).max(10000),
          parentId: z.string().nullable().optional(),
        }),
      )
      .min(1, "La liste ne peut pas être vide.")
      .max(200, "Maximum 200 éléments par réordonnancement."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { navigation: ["update"] });
    adminRateLimit(context, user.id, "nav");

    const db = getDrizzle();
    let menuId: string | null = null;
    await db.transaction(async (tx) => {
      // Verify all items belong to the same menu
      if (input.items.length > 0) {
        const itemIds = input.items.map((i) => i.id);
        const existingItems = await tx
          .select({ id: navigationItems.id, menuId: navigationItems.menuId })
          .from(navigationItems)
          .where(inArray(navigationItems.id, itemIds));
        if (existingItems.length !== itemIds.length) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Un ou plusieurs éléments de navigation sont introuvables.",
          });
        }
        const menuIds = new Set(existingItems.map((i) => i.menuId));
        if (menuIds.size !== 1) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Tous les éléments doivent appartenir au même menu.",
          });
        }
        menuId = existingItems[0]?.menuId ?? null;
      }

      for (const item of input.items) {
        // Validate parent hierarchy when parentId is being changed
        if (item.parentId !== undefined && item.parentId !== null) {
          await assertNoCycle(tx, item.id, item.parentId);
        }
        const data: { sortOrder: number; parentId?: string | null } = {
          sortOrder: item.sortOrder,
        };
        if (item.parentId !== undefined) {
          data.parentId = item.parentId;
        }
        const [updated] = await tx
          .update(navigationItems)
          .set(data)
          .where(eq(navigationItems.id, item.id))
          .returning({ id: navigationItems.id });
        if (!updated) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: `Élément de navigation introuvable : ${item.id}`,
          });
        }
      }
    });

    auditAdmin(context, user.id, "NAVIGATION_ITEM_UPDATE", {
      resource: "navigation_items",
      resourceId: input.items[0]?.id ?? null,
      metadata: { reorderedCount: input.items.length, menuId },
    });

    invalidateCache("nav:");
    return { success: true as const };
  },
});
