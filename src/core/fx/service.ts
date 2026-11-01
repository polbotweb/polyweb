/**
 * core/fx — service des taux (générique, tout module) :
 * - `fxSettings` / `setBaseCurrency` / `lockBaseCurrency` : devise de tenue, verrouillée dès la
 *   première émission (jamais de réinterprétation de l'historique) ;
 * - `importEcbDays` / `fetchEcbRates` : import idempotent du flux BCE (cron quotidien) ;
 * - `setManualRate` / `deleteManualRate` : forçage administrateur, prioritaire à date égale ;
 * - `findRate` : taux exact `from → to` au jour J (dernier jour coté ≤ J, au plus `MAX_STALE_DAYS`),
 *   direct, inverse ou croisé via l'EUR de la BCE.
 */
import { and, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { getDrizzle } from '@database/drizzle';
import { exchangeRates, exchangeRateSettings, type ExchangeRateSource } from '@database/schemas/exchange-rates.schema';
import { isCurrencyCode, type CurrencyCode } from '@/core/money';
import { dbTry } from '@/lib/effect/run';
import { BaseCurrencyLockedError, EcbFetchError, InvalidRateError, RateNotFoundError } from '@/core/fx/errors';
import { ECB_BASE, ECB_DAILY_URL, parseEcbXml, type EcbDay } from '@/core/fx/ecb';
import { crossRate, invert, ONE, parseRate, rateToDecimal, type Rate } from '@/core/fx/rate';

/** Ancienneté maximale d'un taux (week-ends et jours fériés BCE compris). */
export const MAX_STALE_DAYS = 7;

const orgEq = <C extends typeof exchangeRates.organizationId | typeof exchangeRateSettings.organizationId>(column: C, organizationId: string | null) =>
  organizationId === null ? isNull(column) : eq(column, organizationId);

export interface FxSettings { readonly baseCurrency: CurrencyCode; readonly lockedAt: Date | null; readonly lastFetchedAt: Date | null }

export const fxSettings = (organizationId: string | null) =>
  dbTry('fx.settings', () => getDrizzle().select().from(exchangeRateSettings).where(orgEq(exchangeRateSettings.organizationId, organizationId)).limit(1)).pipe(
    Effect.map(([row]): FxSettings => ({
      baseCurrency: row && isCurrencyCode(row.baseCurrency) ? row.baseCurrency : 'EUR',
      lockedAt: row?.lockedAt ?? null,
      lastFetchedAt: row?.lastFetchedAt ?? null,
    })),
  );

const upsertSettings = (organizationId: string | null, values: Partial<{ baseCurrency: string; lockedAt: Date; lastFetchedAt: Date }>) =>
  dbTry('fx.settings.upsert', () =>
    getDrizzle().insert(exchangeRateSettings).values({ organizationId, ...values })
      .onConflictDoUpdate({ target: exchangeRateSettings.organizationId, set: { ...values, updatedAt: new Date() } }),
  );

/** Change la devise de tenue — refusé une fois verrouillée. */
export const setBaseCurrency = (organizationId: string | null, baseCurrency: CurrencyCode) =>
  Effect.gen(function* () {
    const current = yield* fxSettings(organizationId);
    if (current.lockedAt && current.baseCurrency !== baseCurrency) return yield* Effect.fail(new BaseCurrencyLockedError({ baseCurrency: current.baseCurrency }));
    yield* upsertSettings(organizationId, { baseCurrency });
    return { ...current, baseCurrency };
  });

/** Verrouille la devise de tenue (idempotent) et la renvoie. */
export const lockBaseCurrency = (organizationId: string | null, now = new Date()) =>
  Effect.gen(function* () {
    const current = yield* fxSettings(organizationId);
    if (current.lockedAt) return current.baseCurrency;
    yield* dbTry('fx.settings.lock', () =>
      getDrizzle().insert(exchangeRateSettings).values({ organizationId, baseCurrency: current.baseCurrency, lockedAt: now })
        .onConflictDoUpdate({ target: exchangeRateSettings.organizationId, set: { lockedAt: sql`coalesce(${exchangeRateSettings.lockedAt}, ${now})`, updatedAt: now } }),
    );
    return current.baseCurrency;
  });

/** Import idempotent de jours BCE (plateforme : taux publics partagés, `organization_id` nul). */
export const importEcbDays = (days: readonly EcbDay[]) =>
  Effect.gen(function* () {
    const rows = days.flatMap((day) => [...day.rates].map(([quote, rate]) => ({ organizationId: null, baseCurrency: ECB_BASE, quoteCurrency: quote, rateDate: day.date, rate: rateToDecimal(rate, 12), source: 'ecb' as const })));
    if (rows.length === 0) return 0;
    yield* dbTry('fx.ecb.import', () =>
      getDrizzle().insert(exchangeRates).values(rows).onConflictDoUpdate({
        target: [exchangeRates.organizationId, exchangeRates.baseCurrency, exchangeRates.quoteCurrency, exchangeRates.rateDate, exchangeRates.source],
        set: { rate: sql`excluded.rate`, updatedAt: new Date() },
      }),
    );
    yield* upsertSettings(null, { lastFetchedAt: new Date() });
    return rows.length;
  });

/** Télécharge et importe le flux BCE (`fetchImpl` injectable : jamais de réseau en test). */
export const fetchEcbRates = (fetchImpl: typeof fetch = fetch, url = ECB_DAILY_URL) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({ try: () => fetchImpl(url, { headers: { accept: 'application/xml' }, signal: AbortSignal.timeout(15_000) }), catch: (cause) => new EcbFetchError({ cause }) });
    if (!response.ok) return yield* Effect.fail(new EcbFetchError({ status: response.status }));
    const xml = yield* Effect.tryPromise({ try: () => response.text(), catch: (cause) => new EcbFetchError({ cause }) });
    const days = yield* parseEcbXml(xml);
    const imported = yield* importEcbDays(days);
    return { days: days.length, imported, latest: days[0]?.date ?? null };
  });

export interface ManualRateInput { readonly organizationId: string | null; readonly from: CurrencyCode; readonly to: CurrencyCode; readonly date: string; readonly rate: string; readonly userId?: string | null }

/** Forçage manuel (1 `from` = `rate` `to` au jour `date`), remplace un forçage existant. */
export const setManualRate = (input: ManualRateInput) =>
  Effect.gen(function* () {
    if (input.from === input.to) return yield* Effect.fail(new InvalidRateError({ input: `${input.from}/${input.to}` }));
    const rate = yield* parseRate(input.rate);
    const value = rateToDecimal(rate, 12);
    const [row] = yield* dbTry('fx.manual.set', () =>
      getDrizzle().insert(exchangeRates).values({ organizationId: input.organizationId, baseCurrency: input.from, quoteCurrency: input.to, rateDate: input.date, rate: value, source: 'manual', createdBy: input.userId ?? null })
        .onConflictDoUpdate({
          target: [exchangeRates.organizationId, exchangeRates.baseCurrency, exchangeRates.quoteCurrency, exchangeRates.rateDate, exchangeRates.source],
          set: { rate: value, createdBy: input.userId ?? null, updatedAt: new Date() },
        }).returning(),
    );
    return row;
  });

export const deleteManualRate = (organizationId: string | null, id: string) =>
  dbTry('fx.manual.delete', () =>
    getDrizzle().delete(exchangeRates).where(and(eq(exchangeRates.id, id), eq(exchangeRates.source, 'manual'), orgEq(exchangeRates.organizationId, organizationId))).returning({ id: exchangeRates.id }),
  ).pipe(Effect.map((rows) => rows.length > 0));

export interface ResolvedRate { readonly rate: Rate; readonly date: string; readonly source: ExchangeRateSource | 'identity' }

const minusDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** Taux exact `from → to` applicable au jour `date` (forçage manuel prioritaire à date égale). */
export const findRate = (organizationId: string | null, from: CurrencyCode, to: CurrencyCode, date: string) =>
  Effect.gen(function* () {
    if (from === to) return { rate: ONE, date, source: 'identity' } satisfies ResolvedRate;
    const floor = minusDays(date, MAX_STALE_DAYS);
    const window = and(lte(exchangeRates.rateDate, date), sql`${exchangeRates.rateDate} >= ${floor}`);
    const [manual] = yield* dbTry('fx.find.manual', () =>
      getDrizzle().select().from(exchangeRates).where(and(window, eq(exchangeRates.source, 'manual'), orgEq(exchangeRates.organizationId, organizationId),
        or(and(eq(exchangeRates.baseCurrency, from), eq(exchangeRates.quoteCurrency, to)), and(eq(exchangeRates.baseCurrency, to), eq(exchangeRates.quoteCurrency, from)))))
        .orderBy(desc(exchangeRates.rateDate)).limit(1),
    );
    const needed = [from, to].filter((c) => c !== ECB_BASE);
    const ecbRows = yield* dbTry('fx.find.ecb', () =>
      getDrizzle().select().from(exchangeRates).where(and(window, eq(exchangeRates.source, 'ecb'), isNull(exchangeRates.organizationId), eq(exchangeRates.baseCurrency, ECB_BASE), inArray(exchangeRates.quoteCurrency, needed)))
        .orderBy(desc(exchangeRates.rateDate)),
    );
    const byDate = new Map<string, Map<string, Rate>>();
    for (const row of ecbRows) {
      const quotes = byDate.get(row.rateDate) ?? new Map<string, Rate>();
      quotes.set(row.quoteCurrency, yield* parseRate(row.rate));
      byDate.set(row.rateDate, quotes);
    }
    const ecb = [...byDate].find(([, quotes]) => needed.every((c) => quotes.has(c)));
    if (manual && (!ecb || manual.rateDate >= ecb[0])) {
      const direct = yield* parseRate(manual.rate);
      return { rate: manual.baseCurrency === from ? direct : invert(direct), date: manual.rateDate, source: 'manual' } satisfies ResolvedRate;
    }
    if (ecb) {
      const rate = crossRate(ECB_BASE, ecb[1], from, to);
      if (rate) return { rate, date: ecb[0], source: 'ecb' } satisfies ResolvedRate;
    }
    return yield* Effect.fail(new RateNotFoundError({ from, to, date }));
  });

/** Taux affichés au back-office : forçages du tenant puis derniers taux BCE (plus récents d'abord). */
export const listRates = (organizationId: string | null, limit = 100) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const take = Math.min(Math.max(limit, 1), 500);
    const manual = yield* dbTry('fx.list.manual', () => db.select().from(exchangeRates)
      .where(and(eq(exchangeRates.source, 'manual'), orgEq(exchangeRates.organizationId, organizationId)))
      .orderBy(desc(exchangeRates.rateDate), exchangeRates.baseCurrency, exchangeRates.quoteCurrency).limit(take));
    const ecb = yield* dbTry('fx.list.ecb', () => db.select().from(exchangeRates)
      .where(and(eq(exchangeRates.source, 'ecb'), isNull(exchangeRates.organizationId)))
      .orderBy(desc(exchangeRates.rateDate), exchangeRates.quoteCurrency).limit(take));
    const latest = ecb[0]?.rateDate ?? null;
    return { manual, ecb: ecb.filter((row) => row.rateDate === latest), latestEcbDate: latest };
  });
