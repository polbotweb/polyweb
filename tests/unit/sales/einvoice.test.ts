/** Sales → EN 16931 : profil vendeur (validation), mapping des catégories, contrôle des totaux, XML valide XSD Factur-X. */
import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import { renderSalesDocumentHtml } from '@/modules/sales/documents';
import { salesFacturXml, salesToEInvoice, type SalesEInvoiceSource } from '@/modules/sales/domain/einvoice';
import { isValidIban, isValidSiren, normalizeSellerProfile, type SellerProfile } from '@/modules/sales/domain/seller-profile';
import { validateFacturXsd } from '../../helpers/factur-x-xsd';

const seller: SellerProfile = {
  legalName: 'Polyweb SAS', vatNumber: 'FR32123456782', legalId: '732829320', legalIdScheme: '0002',
  addressLine1: '1 rue de la Paix', addressLine2: null, postcode: '75002', city: 'Paris', country: 'FR',
  email: 'factures@polyweb.test', iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP',
};

const invoice: SalesEInvoiceSource = {
  kind: 'invoice', status: 'ISSUED', number: 'FA-2026-00001', issueDate: '2026-10-01', dueDate: '2026-10-31', currency: 'EUR',
  customerName: 'ACME & Co', customerEmail: 'a@b.test', customerAddress: '2 av. X\n69001 Lyon', customerCountry: 'FR', customerVatNumber: 'FR 40 303 265 045',
  taxMention: null, notes: 'Merci', netMinor: 19_500, taxMinor: 3_683, grossMinor: 23_183, sourceDocumentId: null, related: [],
  lines: [
    { description: 'Conseil', quantity: '2.0000', unitPriceMinor: 10_000, taxCategory: 'standard', ratePercent: '20.0000', netMinor: 18_000 },
    { description: 'Livre', quantity: '1.5000', unitPriceMinor: 1_000, taxCategory: 'super-reduced', ratePercent: '5.5000', netMinor: 1_500 },
  ],
};

const reason = async (effect: Effect.Effect<unknown, { reason: string }>) => {
  const exit = await Effect.runPromiseExit(effect);
  return Exit.isFailure(exit) ? JSON.stringify(exit.cause).match(/"reason":"([^"]+)"/)?.[1] : null;
};

describe('sales/seller-profile', () => {
  it('IBAN (mod 97) et SIREN (Luhn)', () => {
    expect(isValidIban('FR7630006000011234567890189')).toBe(true);
    expect(isValidIban('FR7630006000011234567890188')).toBe(false);
    expect(isValidSiren('732829320')).toBe(true);
    expect(isValidSiren('732829321')).toBe(false);
  });
  it('normalise (espaces, casse) et rejette les champs invalides', async () => {
    const profile = await Effect.runPromise(normalizeSellerProfile({ ...seller, vatNumber: 'fr 32 123 456 782', iban: 'fr76 3000 6000 0112 3456 7890 189', country: 'fr', addressLine2: '  ' }));
    expect(profile).toMatchObject({ vatNumber: 'FR32123456782', iban: 'FR7630006000011234567890189', country: 'FR', addressLine2: null });
    for (const [field, value] of [['iban', 'FR00'], ['legalId', '123456789'], ['country', 'FRA'], ['bic', 'XX'], ['email', 'nope'], ['vatNumber', '123']] as const) {
      const exit = await Effect.runPromiseExit(normalizeSellerProfile({ ...seller, [field]: value }));
      expect(JSON.stringify(exit)).toContain(`"field":"${field}"`);
    }
  });
});

describe('sales → Factur-X', () => {
  it('facture émise : XML valide XSD, totaux égaux aux totaux figés, remise et IBAN', async () => {
    const { xml, totals, invoice: model } = await Effect.runPromise(salesFacturXml(invoice, seller, 'fr'));
    expect(totals).toMatchObject({ taxBasisMinor: 19_500, taxMinor: 3_683, grandTotalMinor: 23_183 });
    expect(model.buyer).toMatchObject({ vatId: 'FR40303265045', address: { line1: '2 av. X', line2: '69001 Lyon', country: 'FR' } });
    expect(model.lines.map((line) => [line.vatCategory, line.vatRatePercent, line.quantity])).toEqual([['S', '20', '2'], ['S', '5.5', '1.5']]);
    expect(xml).toContain('<ram:IBANID>FR7630006000011234567890189</ram:IBANID>');
    expect((await validateFacturXsd(xml)).errors).toEqual([]);
  });

  it('remise de ligne → allowance = brut − net', async () => {
    const model = await Effect.runPromise(salesToEInvoice({ ...invoice, lines: [{ ...invoice.lines[0]!, netMinor: 16_200 }] }, seller, 'fr'));
    expect(model.lines[0]).toMatchObject({ unitPriceMinor: 10_000, allowanceMinor: 3_800, netMinor: 16_200 });
  });

  it('avoir autoliquidé (AE) : 381, facture d’origine, VATEX et mention, XSD valide', async () => {
    const credit: SalesEInvoiceSource = {
      ...invoice, kind: 'credit_note', number: 'AV-2026-00001', taxMention: 'reverse-charge-services', notes: null,
      customerCountry: 'DE', customerVatNumber: 'DE123456789', customerAddress: null,
      netMinor: 5_000, taxMinor: 0, grossMinor: 5_000, sourceDocumentId: 'inv-1', related: [{ id: 'inv-1', number: 'FA-2026-00001' }],
      lines: [{ description: 'Conseil', quantity: '1', unitPriceMinor: 5_000, taxCategory: 'standard', ratePercent: '0', netMinor: 5_000 }],
    };
    const { xml, invoice: model } = await Effect.runPromise(salesFacturXml(credit, seller, 'en'));
    expect(model).toMatchObject({ typeCode: '381', payeeIban: null, precedingInvoice: { number: 'FA-2026-00001' } });
    expect(model.exemptionReasons?.AE?.code).toBe('VATEX-EU-AE');
    expect(xml).toContain('<ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>');
    expect((await validateFacturXsd(xml)).errors).toEqual([]);
  });

  it('catégories : exonéré → E (motif), taux nul → Z', async () => {
    const lines = [
      { description: 'Formation', quantity: '1', unitPriceMinor: 1_000, taxCategory: 'exempt', ratePercent: '0', netMinor: 1_000 },
      { description: 'Journal', quantity: '1', unitPriceMinor: 500, taxCategory: 'zero', ratePercent: '0', netMinor: 500 },
    ];
    const model = await Effect.runPromise(salesToEInvoice({ ...invoice, lines, netMinor: 1_500, taxMinor: 0, grossMinor: 1_500 }, seller, 'fr'));
    expect(model.lines.map((line) => line.vatCategory)).toEqual(['E', 'Z']);
    expect(model.exemptionReasons?.E?.text).toBe('Exonération de TVA');
  });

  it('refus motivés : devis, brouillon, sans profil, totaux divergents', async () => {
    expect(await reason(salesFacturXml({ ...invoice, kind: 'quote' }, seller, 'fr'))).toBe('not-invoice');
    expect(await reason(salesFacturXml({ ...invoice, status: 'DRAFT' }, seller, 'fr'))).toBe('not-issued');
    expect(await reason(salesFacturXml({ ...invoice, number: null }, seller, 'fr'))).toBe('not-issued');
    expect(await reason(salesFacturXml(invoice, null, 'fr'))).toBe('no-seller-profile');
    expect(await reason(salesFacturXml({ ...invoice, taxMinor: 3_684, grossMinor: 23_184 }, seller, 'fr'))).toBe('totals-mismatch');
    expect(await reason(salesFacturXml({ ...invoice, lines: [{ ...invoice.lines[0]!, netMinor: 30_000 }] }, seller, 'fr'))).toBe('totals-mismatch');
  });

  it('gabarit : identité vendeur et mention légale lisible', () => {
    const html = renderSalesDocumentHtml({
      ...invoice, title: 'T', paidMinor: 0, creditedMinor: 0, validUntil: null, taxMention: 'reverse-charge-services',
      kind: 'invoice', status: 'ISSUED',
      lines: invoice.lines.map((line) => ({ ...line, discountPercent: '0' })),
    }, { locale: 'fr', seller });
    expect(html).toContain('Polyweb SAS');
    expect(html).toContain('FR32123456782');
    expect(html).toContain('FR7630006000011234567890189');
    expect(html).toContain('Autoliquidation');
  });
});
