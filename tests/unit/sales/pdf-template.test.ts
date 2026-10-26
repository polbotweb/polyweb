/** Gabarit imprimable des documents de vente : échappement, totaux, RTL, nom de fichier, rendu via le port. */
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { PdfRenderer, makeMemoryPdfRenderer } from '@/core/documents';
import { renderSalesDocumentHtml, renderSalesDocumentPdf, salesPdfFilename, type PrintableSalesDocument } from '@/modules/sales/documents';

const doc: PrintableSalesDocument = {
  kind: 'invoice',
  number: 'FA-2026-00001',
  title: 'Prestation <web>',
  status: 'ISSUED',
  currency: 'EUR',
  customerName: 'ACME & Co',
  customerAddress: '1 rue de Paris',
  customerVatNumber: 'FR123',
  customerEmail: 'a@b.test',
  issueDate: '2026-10-01',
  dueDate: '2026-10-31',
  validUntil: null,
  netMinor: 10000,
  taxMinor: 2000,
  grossMinor: 12000,
  paidMinor: 5000,
  creditedMinor: 0,
  taxMention: null,
  notes: '<script>alert(1)</script>',
  lines: [{ description: 'Site vitrine', quantity: '2', unitPriceMinor: 5000, discountPercent: '0', ratePercent: '20', netMinor: 10000 }],
};

describe('renderSalesDocumentHtml', () => {
  it('échappe les valeurs saisies', () => {
    const html = renderSalesDocumentHtml(doc, { locale: 'fr' });
    expect(html).toContain('ACME &amp; Co');
    expect(html).toContain('Prestation &lt;web&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('affiche titre, lignes et totaux (dont le reste dû)', () => {
    const html = renderSalesDocumentHtml(doc, { locale: 'en', sellerName: 'Polyweb' });
    expect(html).toContain('Invoice FA-2026-00001');
    expect(html).toContain('Site vitrine');
    expect(html).toContain('Polyweb');
    expect(html).toMatch(/120\.00/);
    expect(html).toMatch(/70\.00/); // 120 − 50 payés
    expect(html).toContain('<html lang="en" dir="ltr">');
  });
  it('arabe : dir rtl et libellés traduits', () => {
    const html = renderSalesDocumentHtml(doc, { locale: 'ar' });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('فاتورة');
  });
  it('devis sans numéro : libellé brouillon, pas de reste dû', () => {
    const html = renderSalesDocumentHtml({ ...doc, kind: 'quote', number: null }, { locale: 'fr' });
    expect(html).toContain('Devis Brouillon (non numéroté)');
    expect(html).not.toContain('Reste');
  });
  it('retire les ressources distantes du CSS du thème', () => {
    const html = renderSalesDocumentHtml(doc, { locale: 'fr', themeCss: ':root{--primary:#123456} body{background:url(https://x.test/a.png)}' });
    expect(html).toContain('--primary:#123456');
    expect(html).not.toContain('x.test');
  });
});

describe('salesPdfFilename', () => {
  it('produit un nom ASCII sans séparateur', () => {
    expect(salesPdfFilename(doc)).toBe('invoice-FA-2026-00001.pdf');
    expect(salesPdfFilename({ kind: 'quote', number: '../a b/é' })).toBe('quote-.._a_b_.pdf');
    expect(salesPdfFilename({ kind: 'quote', number: null })).toBe('quote-draft.pdf');
  });
});

describe('renderSalesDocumentPdf', () => {
  it('passe le HTML au port PdfRenderer', () => {
    const memory = makeMemoryPdfRenderer();
    const bytes = Effect.runSync(renderSalesDocumentPdf(doc, { locale: 'fr' }).pipe(Effect.provideService(PdfRenderer, memory)));
    expect(new TextDecoder().decode(bytes)).toMatch(/^%PDF-/);
    expect(memory.rendered[0]).toContain('Facture FA-2026-00001');
  });
});
