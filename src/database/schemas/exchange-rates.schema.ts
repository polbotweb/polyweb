import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, date, unique, index, check } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.schema";

/**
 * Multi-devise (core/fx, docs/multi-currency.md).
 *
 * `exchange_rates` : un taux par paire, jour et source — 1 `base_currency` = `rate` `quote_currency`,
 * décimal exact (texte, lu en fraction BigInt). Source `ecb` (cron quotidien) ou `manual`
 * (forçage administrateur, prioritaire sur `ecb` pour le même jour).
 * `exchange_rate_settings` : devise de tenue de l'organisation, verrouillée (`locked_at`) dès la
 * première écriture comptable afin de ne jamais réinterpréter l'historique.
 */
export const EXCHANGE_RATE_SOURCES = ["ecb", "manual"] as const;
export type ExchangeRateSource = (typeof EXCHANGE_RATE_SOURCES)[number];

export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull(),
    quoteCurrency: varchar("quote_currency", { length: 3 }).notNull(),
    rateDate: date("rate_date", { mode: "string" }).notNull(),
    rate: text("rate").notNull(),
    source: text("source", { enum: EXCHANGE_RATE_SOURCES }).notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    unique("exchange_rates_pair_day_source_uq").on(table.organizationId, table.baseCurrency, table.quoteCurrency, table.rateDate, table.source).nullsNotDistinct(),
    index("exchange_rates_lookup_idx").on(table.baseCurrency, table.quoteCurrency, table.rateDate),
    check("exchange_rates_rate_ck", sql`${table.rate} ~ '^[0-9]+(\\.[0-9]+)?$' and ${table.rate} !~ '^0+(\\.0+)?$'`),
    check("exchange_rates_pair_ck", sql`${table.baseCurrency} <> ${table.quoteCurrency}`),
    check("exchange_rates_source_ck", sql`${table.source} in ('ecb', 'manual')`),
  ],
);

export const exchangeRateSettings = pgTable(
  "exchange_rate_settings",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    baseCurrency: varchar("base_currency", { length: 3 }).default("EUR").notNull(),
    lockedAt: timestamp("locked_at"),
    lastFetchedAt: timestamp("last_fetched_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [unique("exchange_rate_settings_org_uq").on(table.organizationId).nullsNotDistinct()],
);

export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type ExchangeRateSettings = typeof exchangeRateSettings.$inferSelect;
