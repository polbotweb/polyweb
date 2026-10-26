/** core/money — unités mineures, arrondis exacts, répartition, conversion, TVA par taux / par ligne. */
import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  add,
  allocate,
  compare,
  computeTaxTotals,
  convert,
  divideRounded,
  formatMoney,
  fromDecimal,
  grossFromNet,
  MoneySchema,
  multiply,
  negate,
  parseCurrency,
  percentage,
  splitGross,
  subtract,
  sum,
  toDecimalString,
  type Money,
  type RoundingMode,
} from '@/core/money';
import { Schema } from 'effect';

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSync(effect);
const fail = <A, E>(effect: Effect.Effect<A, E>) => {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) throw new Error('succès inattendu');
  return exit;
};
const eur = (amountMinor: number): Money => ({ amountMinor, currency: 'EUR' });

describe('divideRounded', () => {
  const cases: Array<[bigint, bigint, RoundingMode, bigint]> = [
    [25n, 10n, 'half-up', 3n],
    [-25n, 10n, 'half-up', -3n],
    [25n, 10n, 'half-even', 2n],
    [35n, 10n, 'half-even', 4n],
    [-25n, 10n, 'half-even', -2n],
    [25n, 10n, 'half-down', 2n],
    [26n, 10n, 'half-down', 3n],
    [21n, 10n, 'up', 3n],
    [-21n, 10n, 'up', -3n],
    [29n, 10n, 'down', 2n],
    [-21n, 10n, 'ceil', -2n],
    [-21n, 10n, 'floor', -3n],
    [21n, 10n, 'ceil', 3n],
    [20n, 10n, 'half-even', 2n],
  ];
  it.each(cases)('%s / %s (%s) = %s', (n, d, mode, expected) => {
    expect(divideRounded(n, d, mode)).toBe(expected);
  });
});

describe('fromDecimal / toDecimalString', () => {
  it('convertit selon l’exposant de la devise', () => {
    expect(run(fromDecimal('12.34', 'EUR'))).toEqual(eur(1234));
    expect(run(fromDecimal('12,3', 'EUR'))).toEqual(eur(1230));
    expect(run(fromDecimal('1500', 'JPY')).amountMinor).toBe(1500);
    expect(run(fromDecimal('1.234', 'KWD')).amountMinor).toBe(1234);
    expect(toDecimalString(eur(-5))).toBe('-0.05');
    expect(toDecimalString({ amountMinor: 1234, currency: 'KWD' })).toBe('1.234');
    expect(toDecimalString({ amountMinor: 7, currency: 'JPY' })).toBe('7');
  });
  it('refuse la précision excédentaire sans mode, l’arrondit avec mode', () => {
    expect(fail(fromDecimal('1.005', 'EUR'))).toMatchObject({ cause: expect.anything() });
    expect(run(fromDecimal('1.005', 'EUR', 'half-up')).amountMinor).toBe(101);
    expect(run(fromDecimal('1.005', 'EUR', 'half-even')).amountMinor).toBe(100);
  });
  it('refuse formats invalides et dépassement', () => {
    for (const input of ['abc', '1e3', '', '1.2.3']) expect(Exit.isFailure(Effect.runSyncExit(fromDecimal(input, 'EUR')))).toBe(true);
    expect(Exit.isFailure(Effect.runSyncExit(fromDecimal('999999999999999999', 'EUR')))).toBe(true);
  });
});

describe('arithmétique', () => {
  it('additionne, soustrait, somme et compare dans la même devise', () => {
    expect(run(add(eur(100), eur(250)))).toEqual(eur(350));
    expect(run(subtract(eur(100), eur(250)))).toEqual(eur(-150));
    expect(run(sum([eur(1), eur(2), eur(3)], 'EUR'))).toEqual(eur(6));
    expect(run(sum([], 'USD'))).toEqual({ amountMinor: 0, currency: 'USD' });
    expect(run(compare(eur(1), eur(2)))).toBe(-1);
    expect(negate(eur(0)).amountMinor).toBe(0);
  });
  it('échoue en CurrencyMismatchError entre devises', () => {
    const exit = Effect.runSyncExit(Effect.flip(add(eur(1), { amountMinor: 1, currency: 'USD' })));
    expect(Exit.isSuccess(exit) && exit.value._tag).toBe('CurrencyMismatchError');
  });
  it('multiplie et applique un pourcentage exacts', () => {
    expect(run(multiply(eur(1999), 3, 'half-up'))).toEqual(eur(5997));
    expect(run(multiply(eur(1000), '0.333', 'half-up'))).toEqual(eur(333));
    expect(run(percentage(eur(1050), '5.5', 'half-up'))).toEqual(eur(58)); // 57,75 → 58
    expect(run(percentage(eur(1050), '5.5', 'down'))).toEqual(eur(57));
    expect(run(percentage(eur(250), '1', 'half-even'))).toEqual(eur(2)); // 2,5 → 2
  });
  it('convertit entre devises d’exposants différents', () => {
    expect(run(convert(eur(1000), 'JPY', '162.35', 'half-up'))).toEqual({ amountMinor: 1624, currency: 'JPY' });
    expect(run(convert({ amountMinor: 1000, currency: 'JPY' }, 'EUR', '0.00616', 'half-up'))).toEqual(eur(616));
    expect(run(convert(eur(100), 'KWD', '0.33', 'half-up'))).toEqual({ amountMinor: 330, currency: 'KWD' });
  });
});

describe('allocate', () => {
  it('répartit sans perte (plus fort reste)', () => {
    const parts = run(allocate(eur(1000), [1, 1, 1]));
    expect(parts.map((p) => p.amountMinor)).toEqual([334, 333, 333]);
    expect(run(allocate(eur(-1000), [1, 1, 1])).map((p) => p.amountMinor)).toEqual([-334, -333, -333]);
    expect(run(allocate(eur(5), [0, 3, 1])).map((p) => p.amountMinor)).toEqual([0, 4, 1]);
    expect(run(allocate(eur(101), [70, 30])).reduce((a, p) => a + p.amountMinor, 0)).toBe(101);
  });
  it('refuse des poids invalides', () => {
    for (const ratios of [[], [0, 0], [-1, 2], [1.5]]) expect(Exit.isFailure(Effect.runSyncExit(allocate(eur(10), ratios)))).toBe(true);
  });
});

describe('devises, schéma et format', () => {
  it('valide les codes ISO 4217', () => {
    expect(run(parseCurrency('eur'))).toBe('EUR');
    expect(Exit.isFailure(Effect.runSyncExit(parseCurrency('XYZ')))).toBe(true);
  });
  it('décode via MoneySchema', () => {
    expect(Schema.decodeUnknownSync(MoneySchema)({ amountMinor: 12, currency: 'EUR' })).toEqual(eur(12));
    expect(() => Schema.decodeUnknownSync(MoneySchema)({ amountMinor: 1.5, currency: 'EUR' })).toThrow();
    expect(() => Schema.decodeUnknownSync(MoneySchema)({ amountMinor: 1, currency: 'XYZ' })).toThrow();
  });
  it('formate selon la locale', () => {
    expect(formatMoney(eur(123456), 'fr').replace(/\s/g, ' ')).toBe('1 234,56 €');
    expect(formatMoney(eur(123456), 'en')).toBe('€1,234.56');
    expect(formatMoney({ amountMinor: 1500, currency: 'JPY' }, 'en')).toBe('¥1,500');
  });
});

describe('TVA', () => {
  it('HT → TTC et ventilation d’un TTC exacte', () => {
    expect(run(grossFromNet(eur(1000), '20'))).toEqual(eur(1200));
    const { net, tax } = run(splitGross(eur(1000), '20'));
    expect(net.amountMinor + tax.amountMinor).toBe(1000);
    expect(net).toEqual(eur(833));
    expect(run(splitGross(eur(1055), '5.5')).net).toEqual(eur(1000));
  });
  it('per-rate arrondit une fois par taux, per-line à chaque ligne', () => {
    const lines = [
      { net: eur(1), ratePercent: '20' },
      { net: eur(1), ratePercent: '20.0' },
      { net: eur(1), ratePercent: '20' },
      { net: eur(1000), ratePercent: '5.5' },
    ];
    const perRate = run(computeTaxTotals(lines, { currency: 'EUR' }));
    expect(perRate.byRate.map((r) => [r.ratePercent, r.base.amountMinor, r.tax.amountMinor])).toEqual([
      ['5.5', 1000, 55],
      ['20', 3, 1],
    ]);
    expect(perRate.gross.amountMinor).toBe(1003 + 56);
    const perLine = run(computeTaxTotals(lines, { currency: 'EUR', strategy: 'per-line' }));
    expect(perLine.byRate.find((r) => r.ratePercent === '20')!.tax.amountMinor).toBe(0);
    const banker = run(computeTaxTotals([{ net: eur(1250), ratePercent: '10' }], { currency: 'EUR', mode: 'half-even' }));
    expect(banker.tax.amountMinor).toBe(125);
  });
  it('autoliquidation / exonération : taux 0', () => {
    const totals = run(computeTaxTotals([{ net: eur(5000), ratePercent: '0' }], { currency: 'EUR' }));
    expect(totals.tax.amountMinor).toBe(0);
    expect(totals.gross.amountMinor).toBe(5000);
  });
});
