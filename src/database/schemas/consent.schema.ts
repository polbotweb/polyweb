import {
  pgTable,
  text,
  timestamp,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Cookie Consent Settings ────────────────────────────────────────────────
// One row per locale. Stores all CMS-editable texts for the cookie consent banner.
export const consentSettings = pgTable(
  "consent_settings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    locale: text("locale").notNull(),

    // ── Banner content ──
    title: text("title").notNull(),
    description: text("description").notNull(),

    // ── Button labels ──
    acceptAll: text("accept_all").notNull(),
    rejectAll: text("reject_all").notNull(),
    customize: text("customize").notNull(),
    savePreferences: text("save_preferences").notNull(),

    // ── Cookie categories ──
    necessaryLabel: text("necessary_label").notNull(),
    necessaryDescription: text("necessary_description").notNull(),
    analyticsLabel: text("analytics_label").notNull(),
    analyticsDescription: text("analytics_description").notNull(),
    marketingLabel: text("marketing_label").notNull(),
    marketingDescription: text("marketing_description").notNull(),

    // ── Privacy link ──
    privacyPolicyLabel: text("privacy_policy_label").notNull(),
    privacyPolicyUrl: text("privacy_policy_url"),

    // ── Toggle visibility ──
    isActive: boolean("is_active").default(true).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("consent_settings_locale_uidx").on(table.locale)],
);
