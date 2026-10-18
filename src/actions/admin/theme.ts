import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq, sql } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { themeSettings } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { assertPermission, adminRateLimit, auditAdmin } from "./_helpers";
import { THEME_TOKEN_KEYS, isValidOklch } from "@/lib/theme-tokens";

const oklchRegex = /^oklch\(\s*[\d.]+%?\s+[\d.]+\s+[\d.]+(?:\s*\/\s*[\d.]+%?)?\s*\)$/;
const colorField = (label: string) =>
  z
    .string()
    .regex(oklchRegex, `La couleur « ${label} » doit être au format OKLCH (ex: oklch(0.65 0.15 250)).`)
    .refine((v) => {
      const m = v.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/);
      if (!m) return false;
      const l = parseFloat(m[1]);
      const isPct = m[2] === '%';
      const c = parseFloat(m[3]);
      const h = parseFloat(m[4]);
      const lValid = isPct ? (l >= 0 && l <= 100) : (l >= 0 && l <= 1);
      return lValid && c >= 0 && c <= 0.5 && h >= 0 && h <= 360;
    }, `La couleur « ${label} » a des valeurs hors limites (L: 0-1 ou 0-100%, C: 0-0.5, H: 0-360).`)
    .nullable()
    .optional();

/** Zod schema for a token map: Record<ThemeTokenKey, oklch(...)>. */
const tokenMapSchema = z
  .string()
  .max(10_000, "Le JSON des tokens ne peut pas dépasser 10 000 caractères.")
  .refine((val) => {
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
      const validKeys = new Set<string>(THEME_TOKEN_KEYS);
      for (const [key, value] of Object.entries(parsed)) {
        if (!validKeys.has(key)) return false;
        if (typeof value !== 'string' || !isValidOklch(value)) return false;
      }
      return true;
    } catch {
      return false;
    }
  }, "Le JSON des tokens est invalide. Chaque valeur doit être au format OKLCH.")
  .nullable()
  .optional();

export const createTheme = defineAction({
  input: z.object({
    name: z.string().min(1, "Le nom du thème est requis.").max(50),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { theme: ["update"] });
    adminRateLimit(context, user.id, "theme");
    const db = getDrizzle();

    // Auto-activate if no active theme exists yet
    const [activeRow] = await db
      .select({ id: themeSettings.id })
      .from(themeSettings)
      .where(eq(themeSettings.isActive, true))
      .limit(1);
    const shouldActivate = !activeRow;

    const [created] = await db
      .insert(themeSettings)
      .values({ name: input.name, isActive: shouldActivate })
      .returning();

    auditAdmin(context, user.id, "THEME_CREATE", {
      resource: "theme_settings",
      resourceId: created.id,
      metadata: { name: created.name },
    });

    invalidateCache("site:theme");
    invalidateCache("site:theme:css");
    invalidateCache("site:themes");
    return created;
  },
});

export const updateTheme = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    name: z
      .string()
      .min(1, "Le nom du thème est requis.")
      .max(50, "Le nom du thème ne peut pas dépasser 50 caractères.")
      .optional(),
    isActive: z.boolean().optional(),
    // Full token maps (new — primary source of truth)
    lightTokens: tokenMapSchema,
    darkTokens: tokenMapSchema,
    // Legacy individual colors (kept for backward compat)
    primaryColor: colorField("primaire"),
    secondaryColor: colorField("secondaire"),
    accentColor: colorField("accent"),
    backgroundColor: colorField("arrière-plan"),
    foregroundColor: colorField("texte"),
    mutedColor: colorField("atténué"),
    mutedForegroundColor: colorField("texte atténué"),
    fontHeading: z
      .string()
      .max(100, "La police de titre ne peut pas dépasser 100 caractères.")
      .nullable()
      .optional(),
    fontBody: z
      .string()
      .max(100, "La police de corps ne peut pas dépasser 100 caractères.")
      .nullable()
      .optional(),
    borderRadius: z
      .string()
      .max(20, "Le border-radius ne peut pas dépasser 20 caractères.")
      .nullable()
      .optional(),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { theme: ["update"] });
    adminRateLimit(context, user.id, "theme");

    const { id, ...data } = input;
    const db = getDrizzle();

    const [updated] = await db.transaction(async (tx) => {
      // Lock all theme rows to prevent concurrent activation races
      await tx.execute(sql`SELECT id FROM theme_settings FOR UPDATE`);

      // Si on active ce thème, désactiver les autres
      if (data.isActive === true) {
        await tx
          .update(themeSettings)
          .set({ isActive: false })
          .where(eq(themeSettings.isActive, true));
      }

      // Prevent deactivating the only active theme (rows already locked above)
      if (data.isActive === false) {
        const activeThemes = await tx
          .select({ id: themeSettings.id })
          .from(themeSettings)
          .where(eq(themeSettings.isActive, true));
        const current = activeThemes.find((r) => r.id === id);
        if (current) {
          const otherActive = activeThemes.some((r) => r.id !== id);
          if (!otherActive) {
            throw new ActionError({
              code: "BAD_REQUEST",
              message: "Impossible de désactiver le seul thème actif. Activez un autre thème d'abord.",
            });
          }
        }
      }

      return tx
        .update(themeSettings)
        .set(data)
        .where(eq(themeSettings.id, id))
        .returning();
    });

    if (!updated) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Thème introuvable.",
      });
    }

    auditAdmin(context, user.id, "THEME_UPDATE", {
      resource: "theme_settings",
      resourceId: id,
      metadata: { name: updated.name, isActive: updated.isActive },
    });

    invalidateCache("site:theme");
    invalidateCache("site:theme:css");
    invalidateCache("site:themes");
    return updated;
  },
});

export const deleteTheme = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { theme: ["update"] });
    adminRateLimit(context, user.id, "theme");
    const db = getDrizzle();

    const existing = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(themeSettings)
        .where(eq(themeSettings.id, input.id))
        .limit(1);

      if (!row) {
        throw new ActionError({ code: "NOT_FOUND", message: "Thème introuvable." });
      }

      if (row.isActive) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Impossible de supprimer le thème actif. Activez un autre thème d'abord.",
        });
      }

      await tx.delete(themeSettings).where(eq(themeSettings.id, input.id));
      return row;
    });

    auditAdmin(context, user.id, "THEME_DELETE", {
      resource: "theme_settings",
      resourceId: input.id,
      metadata: { name: existing.name },
    });

    invalidateCache("site:theme");
    invalidateCache("site:theme:css");
    invalidateCache("site:themes");
    return { success: true as const };
  },
});
