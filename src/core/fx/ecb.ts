/**
 * Lecture du flux quotidien BCE (eurofxref-daily.xml / -hist-90d.xml), sans dépendance :
 * éléments `<Cube time="AAAA-MM-JJ">` contenant des `<Cube currency="USD" rate="1.0834"/>`.
 * Base EUR ; seules les devises connues de core/money sont retenues.
 */
import { Effect } from 'effect';
import { isCurrencyCode, type CurrencyCode } from '@/core/money';
import { EcbFeedError } from '@/core/fx/errors';
import { parseRate, type Rate } from '@/core/fx/rate';

export const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const ECB_BASE: CurrencyCode = 'EUR';

export interface EcbDay { readonly date: string; readonly rates: ReadonlyMap<CurrencyCode, Rate> }

const DAY_START = /<Cube\s+time=['"]([^'"]*)['"]\s*>/g;
const QUOTE = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/>/g;
const validDate = (iso: string) => !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) && new Date(`${iso}T00:00:00Z`).toISOString().startsWith(iso);

/** Jours de cotation, du plus récent au plus ancien (ordre du flux). */
export const parseEcbXml = (xml: string): Effect.Effect<readonly EcbDay[], EcbFeedError> =>
  Effect.gen(function* () {
    if (!xml.includes('gesmes:Envelope') && !xml.includes('<Cube')) return yield* Effect.fail(new EcbFeedError({ reason: 'format' }));
    const days: EcbDay[] = [];
    const starts = [...xml.matchAll(DAY_START)];
    for (const [i, start] of starts.entries()) {
      const date = start[1];
      const body = xml.slice((start.index ?? 0) + start[0].length, starts[i + 1]?.index ?? xml.length);
      if (!date || !validDate(date)) return yield* Effect.fail(new EcbFeedError({ reason: 'date', detail: date }));
      const rates = new Map<CurrencyCode, Rate>();
      for (const [, code, value] of (body ?? '').matchAll(QUOTE)) {
        if (!code || !value || !isCurrencyCode(code) || code === ECB_BASE) continue;
        rates.set(code, yield* parseRate(value).pipe(Effect.mapError(() => new EcbFeedError({ reason: 'rate', detail: `${code}=${value}` }))));
      }
      if (rates.size > 0) days.push({ date, rates });
    }
    return days.length > 0 ? days : yield* Effect.fail(new EcbFeedError({ reason: 'empty' }));
  });
