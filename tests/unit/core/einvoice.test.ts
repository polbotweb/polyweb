import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import { buildFacturXml, computeEInvoiceTotals, escapeXml, validateEInvoice, type EInvoice } from '@/core/einvoice';
import { validateFacturXsd } from '../../helpers/factur-x-xsd';

const invoice: EInvoice = {
  typeCode: '380',
  number: 'F-2026-0001',
  issueDate: '2026-10-27',
  currency: 'EUR',
  seller: {
    name: 'Polyweb SAS', vatId: 'FR32123456789', legalId: { value: '123456789', scheme: '0002' },
    address: { line1: '1 rue de la Paix', postcode: '75002', city: 'Paris', country: 'FR' }, email: 'factures@polyweb.test',
  },
  buyer: { name: 'Client & Fils <SARL>', vatId: 'FR40303265045', address: { line1: '2 av. X', postcode: '69001', city: 'Lyon', country: 'FR' } },
  lines: [
    { id: '1', name: 'Conseil', quantity: '2', unitPriceMinor: 10_000, allowanceMinor: 2_000, netMinor: 18_000, vatCategory: 'S', vatRatePercent: '20.0000' },
    { id: '2', name: 'Livre', quantity: '1.5', unitPriceMinor: 1_000, netMinor: 1_500, vatCategory: 'S', vatRatePercent: '5.5' },
  ],
  dueDate: '2026-11-26',
  paymentTerms: '30 jours',
  payeeIban: 'FR7630006000011234567890189',
  notes: ['Pénalités de retard : 3 fois le taux légal.'],
};

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const ruleOf = async (value: EInvoice) => {
  const exit = await Effect.runPromiseExit(validateEInvoice(value));
  return Exit.isFailure(exit) ? JSON.stringify(exit.cause).match(/"rule":"([^"]+)"/)?.[1] : null;
};

describe('core/einvoice — totaux', () => {
  it('ventile par catégorie et taux, arrondi half-up par groupe', async () => {
    const totals = await run(computeEInvoiceTotals(invoice));
    expect(totals.vat).toEqual([
      { category: 'S', ratePercent: '5.5', baseMinor: 1_500, taxMinor: 83 },
      { category: 'S', ratePercent: '20', baseMinor: 18_000, taxMinor: 3_600 },
    ]);
    expect(totals).toMatchObject({ lineTotalMinor: 19_500, taxBasisMinor: 19_500, taxMinor: 3_683, grandTotalMinor: 23_183, duePayableMinor: 23_183 });
  });
});

describe('core/einvoice — XML CII Factur-X EN 16931', () => {
  it('facture valide contre le XSD Factur-X 1.09 EN 16931', async () => {
    const { xml } = await run(buildFacturXml(invoice));
    expect(xml).toContain('<ram:ID>urn:cen.eu:en16931:2017</ram:ID>');
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">36.83</ram:TaxTotalAmount>');
    expect(xml).toContain('<ram:GrandTotalAmount>231.83</ram:GrandTotalAmount>');
    expect(xml).toContain('Client &amp; Fils &lt;SARL&gt;');
    expect(xml).toContain('<ram:ID schemeID="0002">123456789</ram:ID>');
    const result = await validateFacturXsd(xml);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('avoir (381) avec facture d’origine et autoliquidation, valide XSD', async () => {
    const credit: EInvoice = {
      ...invoice, typeCode: '381', number: 'AV-2026-0001', payeeIban: null, notes: [],
      buyer: { name: 'Kunde GmbH', vatId: 'DE123456789', address: { country: 'DE' } },
      lines: [{ id: '1', name: 'Conseil', quantity: '1', unitPriceMinor: 5_000, netMinor: 5_000, vatCategory: 'AE', vatRatePercent: '0' }],
      exemptionReasons: { AE: { text: 'Autoliquidation', code: 'VATEX-EU-AE' } },
      precedingInvoice: { number: 'F-2026-0001', issueDate: '2026-10-27' },
    };
    const { xml, totals } = await run(buildFacturXml(credit));
    expect(totals.taxMinor).toBe(0);
    expect(xml).toContain('<ram:TypeCode>381</ram:TypeCode>');
    expect(xml).toContain('<ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>');
    expect(xml).toContain('<ram:IssuerAssignedID>F-2026-0001</ram:IssuerAssignedID>');
    expect((await validateFacturXsd(xml)).valid).toBe(true);
  });

  it('le XSD rejette un XML altéré (contrôle du validateur)', async () => {
    const { xml } = await run(buildFacturXml(invoice));
    const broken = xml.replace('<ram:TypeCode>380</ram:TypeCode>', '<ram:Bogus>380</ram:Bogus>');
    expect((await validateFacturXsd(broken)).valid).toBe(false);
  });

  it('échappe et retire les caractères interdits', () => {
    expect(escapeXml('a\u0001<b>&"\'')).toBe('a&lt;b&gt;&amp;&quot;&apos;');
  });
});

describe('core/einvoice — règles EN 16931', () => {
  it.each([
    ['BR-02', { number: ' ' }],
    ['BR-03', { issueDate: '2026-02-30' }],
    ['BR-06', { seller: { ...invoice.seller, name: '' } }],
    ['BR-11', { buyer: { ...invoice.buyer, address: { country: 'France' } } }],
    ['BR-16', { lines: [] }],
    ['BR-CO-26', { seller: { ...invoice.seller, vatId: null, legalId: null } }],
    ['BR-S-02', { seller: { ...invoice.seller, vatId: null } }],
    ['BR-CO-25', { dueDate: null, paymentTerms: null }],
    ['BT-84', { payeeIban: 'NOT-AN-IBAN' }],
  ] as const)('%s', async (rule, patch) => {
    expect(await ruleOf({ ...invoice, ...patch } as EInvoice)).toBe(rule);
  });

  it('lignes : identifiant unique, quantité, taux cohérent avec la catégorie', async () => {
    const [line] = invoice.lines;
    expect(await ruleOf({ ...invoice, lines: [line, line] })).toBe('BR-21');
    expect(await ruleOf({ ...invoice, lines: [{ ...line, quantity: '0' }] })).toBe('BR-22');
    expect(await ruleOf({ ...invoice, lines: [{ ...line, vatCategory: 'S', vatRatePercent: '0' }] })).toBe('BR-S-05');
    expect(await ruleOf({ ...invoice, lines: [{ ...line, vatCategory: 'Z', vatRatePercent: '20' }] })).toBe('BR-Z-05');
  });

  it('exonérations : motif requis, n° TVA acheteur en autoliquidation / intracom.', async () => {
    const [line] = invoice.lines;
    const exempt = { ...line, vatCategory: 'E' as const, vatRatePercent: '0' };
    expect(await ruleOf({ ...invoice, lines: [exempt] })).toBe('BR-E-10');
    expect(await ruleOf({ ...invoice, lines: [exempt], exemptionReasons: { E: { text: 'Art. 261 CGI' } } })).toBeNull();
    const ic = { ...line, vatCategory: 'K' as const, vatRatePercent: '0' };
    expect(await ruleOf({ ...invoice, buyer: { ...invoice.buyer, vatId: null }, lines: [ic], exemptionReasons: { K: { code: 'VATEX-EU-IC' } } })).toBe('BR-IC-02');
  });
});
