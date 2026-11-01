import { describe, expect, it } from 'vitest';
import { Effect, Exit } from 'effect';
import { convertAt, crossRate, invert, parseEcbXml, parseRate, rateEquals, rateToDecimal, reduce } from '@/core/fx';

const run = <A, E>(e: Effect.Effect<A, E>) => Effect.runSync(e);
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
<Cube><Cube time='2026-10-30'><Cube currency='USD' rate='1.0834'/><Cube currency='JPY' rate='162.5'/><Cube currency='GBP' rate='0.8312'/><Cube currency='XXX' rate='9'/></Cube>
<Cube time='2026-10-29'><Cube currency='USD' rate='1.08'/></Cube></Cube></gesmes:Envelope>`;

describe('core/fx rate', () => {
  it('parse et réduit', () => {
    expect(run(parseRate('1.0834'))).toEqual({ numerator: 5417n, denominator: 5000n });
    expect(Exit.isFailure(Effect.runSyncExit(parseRate('0')))).toBe(true);
    expect(Exit.isFailure(Effect.runSyncExit(parseRate('-1')))).toBe(true);
    expect(Exit.isFailure(Effect.runSyncExit(parseRate('abc')))).toBe(true);
  });
  it('inverse exactement (aller-retour)', () => {
    const r = run(parseRate('1.0834'));
    expect(rateEquals(invert(invert(r)), r)).toBe(true);
    expect(rateToDecimal(invert(r), 6)).toBe('0.92302');
  });
  it('taux croisé exact via EUR', () => {
    const [day] = run(parseEcbXml(XML));
    const usdGbp = crossRate('EUR', day!.rates, 'USD', 'GBP')!;
    expect(usdGbp).toEqual(reduce(8312n * 10000n, 10834n * 10000n));
    expect(crossRate('EUR', day!.rates, 'EUR', 'EUR')).toEqual({ numerator: 1n, denominator: 1n });
    expect(crossRate('EUR', day!.rates, 'CHF', 'EUR')).toBeUndefined();
  });
  it('convertit avec exposants et un seul arrondi', () => {
    const r = run(parseRate('162.5'));
    expect(run(convertAt({ amountMinor: 1001, currency: 'EUR' }, 'JPY', r, 'half-even'))).toEqual({ amountMinor: 1627, currency: 'JPY' });
    expect(run(convertAt({ amountMinor: 1627, currency: 'JPY' }, 'EUR', invert(r), 'half-up'))).toEqual({ amountMinor: 1001, currency: 'EUR' });
    expect(run(convertAt({ amountMinor: 1000, currency: 'EUR' }, 'KWD', run(parseRate('0.33')), 'half-up'))).toEqual({ amountMinor: 3300, currency: 'KWD' });
  });
});

describe('core/fx ECB XML', () => {
  it('lit les jours et ignore les devises inconnues', () => {
    const days = run(parseEcbXml(XML));
    expect(days.map((d) => d.date)).toEqual(['2026-10-30', '2026-10-29']);
    expect([...days[0]!.rates.keys()]).toEqual(['USD', 'JPY', 'GBP']);
  });
  it('refuse un flux vide, une date ou un taux invalides', () => {
    expect(Exit.isFailure(Effect.runSyncExit(parseEcbXml('<html/>')))).toBe(true);
    expect(Exit.isFailure(Effect.runSyncExit(parseEcbXml("<Cube><Cube time='2026-02-30'><Cube currency='USD' rate='1'/></Cube></Cube>")))).toBe(true);
    expect(Exit.isFailure(Effect.runSyncExit(parseEcbXml("<Cube><Cube time='2026-01-02'><Cube currency='USD' rate='0'/></Cube></Cube>")))).toBe(true);
    expect(Exit.isFailure(Effect.runSyncExit(parseEcbXml("<Cube><Cube time='2026-01-02'></Cube></Cube>")))).toBe(true);
  });
});
