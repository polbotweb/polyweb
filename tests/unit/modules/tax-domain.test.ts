/** Module tax — régimes TVA (national, OSS, autoliquidation, export), taux, écritures, FEC et CSV. */
import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import type { Money } from '@/core/money';
import { buildSaleEntry, toAccountingCsv, toFec, FEC_COLUMNS, type JournalEntry } from '@/modules/tax/domain/accounting';
import { computeDocumentTax, DEFAULT_TAX_RATES, resolveTaxRate } from '@/modules/tax/domain/rates';
import { determineTax, EU_COUNTRIES, isValidVatNumberFormat, legalMention, type TaxContext } from '@/modules/tax/domain/rules';

const eur = (amountMinor: number): Money => ({ amountMinor, currency: 'EUR' });
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSync(effect);
const base: TaxContext = { sellerCountry: 'FR', buyerCountry: 'FR', customerType: 'B2C', supplyType: 'goods' };

describe('tax/rules', () => {
  it('national : TVA du vendeur', () => {
    expect(run(determineTax(base))).toEqual({ treatment: 'domestic', taxCountry: 'FR', charged: true, mention: null });
  });
  it('B2C intra-UE : origine sans OSS, destination avec OSS', () => {
    expect(run(determineTax({ ...base, buyerCountry: 'DE' })).taxCountry).toBe('FR');
    const oss = run(determineTax({ ...base, buyerCountry: 'DE', ossRegistered: true }));
    expect(oss).toMatchObject({ treatment: 'intra-eu-b2c-destination', taxCountry: 'DE', charged: true });
  });
  it('B2B intra-UE avec n° de TVA : autoliquidation, mention biens / services', () => {
    const goods = run(determineTax({ ...base, buyerCountry: 'DE', customerType: 'B2B', buyerVatNumber: 'DE 123 456 789' }));
    expect(goods).toEqual({ treatment: 'intra-eu-reverse-charge', taxCountry: null, charged: false, mention: 'intra-eu-goods-exempt' });
    const services = run(determineTax({ ...base, buyerCountry: 'BE', customerType: 'B2B', buyerVatNumber: 'BE0123456789', supplyType: 'services' }));
    expect(services.mention).toBe('reverse-charge-services');
  });
  it('B2B intra-UE sans n° de TVA valide : erreur typée', () => {
    const exit = Effect.runSyncExit(determineTax({ ...base, buyerCountry: 'DE', customerType: 'B2B', buyerVatNumber: 'DE12' }));
    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toContain('buyerVatNumber');
  });
  it('export hors UE : exonération', () => {
    expect(run(determineTax({ ...base, buyerCountry: 'US' }))).toMatchObject({ treatment: 'export', charged: false, mention: 'export-exempt' });
  });
  it('pays invalide : erreur', () => {
    expect(Exit.isFailure(Effect.runSyncExit(determineTax({ ...base, sellerCountry: 'France' })))).toBe(true);
  });
  it('formats de n° de TVA', () => {
    expect(isValidVatNumberFormat('FR', 'FR40303265045')).toBe(true);
    expect(isValidVatNumberFormat('GR', 'EL123456789')).toBe(true);
    expect(isValidVatNumberFormat('NL', 'NL123456789B01')).toBe(true);
    expect(isValidVatNumberFormat('FR', 'FR123')).toBe(false);
    expect(isValidVatNumberFormat('US', 'US123')).toBe(false);
  });
  it('mentions légales en 4 langues (repli fr)', () => {
    for (const locale of ['fr', 'en', 'es', 'ar']) expect(legalMention('export-exempt', locale).length).toBeGreaterThan(10);
    expect(legalMention('reverse-charge-services', 'de')).toContain('CGI');
  });
});

describe('tax/rates', () => {
  it('taux standard pour les 27 États membres', () => {
    for (const country of EU_COUNTRIES) expect(DEFAULT_TAX_RATES.some((r) => r.countryCode === country && r.category === 'standard')).toBe(true);
  });
  it('surcharge tenant prioritaire et période de validité', () => {
    const rates = [
      { countryCode: 'FR', category: 'reduced' as const, ratePercent: '11', organizationId: 'org', validFrom: '2027-01-01' },
      ...DEFAULT_TAX_RATES,
    ];
    expect(run(resolveTaxRate(rates, { countryCode: 'fr', category: 'reduced', date: '2026-10-26' }))).toBe('10');
    expect(run(resolveTaxRate(rates, { countryCode: 'FR', category: 'reduced', date: '2027-02-01' }))).toBe('11');
    const b2b = [{ countryCode: 'FR', category: 'standard' as const, ratePercent: '19.6', customerType: 'B2B' as const }, ...DEFAULT_TAX_RATES];
    expect(run(resolveTaxRate(b2b, { countryCode: 'FR', category: 'standard', date: '2026-10-26', customerType: 'B2B' }))).toBe('19.6');
    expect(run(resolveTaxRate(b2b, { countryCode: 'FR', category: 'standard', date: '2026-10-26', customerType: 'B2C' }))).toBe('20');
    expect(run(resolveTaxRate(rates, { countryCode: 'FR', category: 'exempt', date: '2027-02-01' }))).toBe('0');
    expect(Exit.isFailure(Effect.runSyncExit(resolveTaxRate(rates, { countryCode: 'US', category: 'standard', date: '2026-01-01' })))).toBe(true);
  });
  it('document : ventilation par taux, autoliquidation à 0 %', () => {
    const lines = [{ net: eur(10000), category: 'standard' as const }, { net: eur(2000), category: 'reduced-2' as const }];
    const domestic = run(computeDocumentTax(lines, { context: base, currency: 'EUR', date: '2026-10-26' }));
    expect(domestic.totals.tax.amountMinor).toBe(2000 + 110);
    expect(domestic.totals.byRate.map((r) => r.ratePercent)).toEqual(['5.5', '20']);
    const ossLines = [{ net: eur(10000), category: 'standard' as const }, { net: eur(2000), category: 'reduced' as const }];
    const oss = run(computeDocumentTax(ossLines, { context: { ...base, buyerCountry: 'DE', ossRegistered: true }, currency: 'EUR', date: '2026-10-26' }));
    expect(oss.totals.byRate.map((r) => [r.ratePercent, r.tax.amountMinor])).toEqual([['7', 140], ['19', 1900]]);
    // Catégorie inexistante dans le pays de destination : erreur explicite (pas de repli silencieux).
    expect(Exit.isFailure(Effect.runSyncExit(computeDocumentTax(lines, { context: { ...base, buyerCountry: 'DE', ossRegistered: true }, currency: 'EUR', date: '2026-10-26' })))).toBe(true);
    const reverse = run(computeDocumentTax(lines, { context: { ...base, buyerCountry: 'DE', customerType: 'B2B', buyerVatNumber: 'DE123456789' }, currency: 'EUR', date: '2026-10-26' }));
    expect(reverse.totals.tax.amountMinor).toBe(0);
    expect(reverse.totals.gross.amountMinor).toBe(12000);
  });
});

describe('tax/accounting', () => {
  const totals = () => run(computeDocumentTax([{ net: eur(10000), category: 'standard' }, { net: eur(2000), category: 'reduced-2' }], { context: base, currency: 'EUR', date: '2026-10-26' })).totals;
  const entry = (): JournalEntry => run(buildSaleEntry({ entryNumber: 'VE000001', date: '2026-10-26', pieceRef: 'F2026-0001', customerAccount: 'C0001', customerName: 'ACME', totals: totals() }));

  it('écriture de vente équilibrée (411 / 706 / 44571)', () => {
    const e = entry();
    expect(e.lines.map((l) => l.account)).toEqual(['411000', '706000', '706000', '445710', '445710']);
    expect(e.lines[0]?.debit.amountMinor).toBe(14110);
    expect(e.lines.reduce((a, l) => a + l.credit.amountMinor, 0)).toBe(14110);
  });
  it('avoir : sens inversé', () => {
    const credit = run(buildSaleEntry({ entryNumber: 'VE000002', date: '2026-10-27', pieceRef: 'A2026-0001', customerAccount: 'C0001', customerName: 'ACME', totals: totals(), creditNote: true }));
    expect(credit.lines[0]?.credit.amountMinor).toBe(14110);
    expect(credit.lines[0]?.label).toContain('Avoir');
  });
  it('écriture déséquilibrée rejetée', () => {
    const bad: JournalEntry = { ...entry(), lines: [{ account: '411000', accountLabel: 'Clients', label: 'x', debit: eur(1), credit: eur(0) }, { account: '706000', accountLabel: 'Ventes', label: 'x', debit: eur(0), credit: eur(2) }] };
    expect(Exit.isFailure(Effect.runSyncExit(toFec([bad], { siren: '123456789', closingDate: '2026-12-31' })))).toBe(true);
  });
  it('FEC : 18 colonnes, dates AAAAMMJJ, décimales à virgule, nom réglementaire', () => {
    const fec = run(toFec([entry()], { siren: '123456789', closingDate: '2026-12-31' }));
    expect(fec.filename).toBe('123456789FEC20261231.txt');
    const rows = fec.content.trimEnd().split('\r\n');
    expect(rows[0]).toBe(FEC_COLUMNS.join('|'));
    expect(rows).toHaveLength(6);
    for (const row of rows) expect(row.split('|')).toHaveLength(18);
    expect(rows[1]).toBe('VE|Ventes|VE000001|20261026|411000|Clients|C0001|ACME|F2026-0001|20261026|Facture F2026-0001 ACME|141,10|0,00|||20261026||');
    expect(Exit.isFailure(Effect.runSyncExit(toFec([], { siren: '12', closingDate: '2026-12-31' })))).toBe(true);
    expect(Exit.isFailure(Effect.runSyncExit(toFec([], { siren: '123456789', closingDate: '31/12/2026' })))).toBe(true);
  });
  it('CSV : échappement et une ligne par mouvement', () => {
    const csv = run(toAccountingCsv([{ ...entry(), pieceRef: 'F;1' }]));
    const rows = csv.trimEnd().split('\r\n');
    expect(rows).toHaveLength(6);
    expect(rows[1]).toContain('"F;1"');
    expect(rows[1]).toContain(';141.10;0.00;EUR');
  });
});
