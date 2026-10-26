/**
 * Rendu PDF réel (Puppeteer + Chromium) des documents de vente en fr / en / ar, avec extraction
 * du texte. Chromium : `PDF_CHROMIUM_PATH`, sinon celui de Playwright (installé en CI).
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Effect, Exit } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { PdfRenderer } from '@/core/documents';
import { closePdfBrowser, makePuppeteerPdfRenderer } from '@/lib/pdf/puppeteer';
import { renderSalesDocumentPdf, type PrintableSalesDocument } from '@/modules/sales/documents';
import { arabicCharCount, extractPdfText, pdfTextIncludes } from '../helpers/pdf-text';

const resolveChromium = () => {
  if (process.env.PDF_CHROMIUM_PATH) return process.env.PDF_CHROMIUM_PATH;
  try {
    return createRequire(import.meta.url)('@playwright/test').chromium.executablePath() as string;
  } catch {
    return '';
  }
};
const chromium = resolveChromium();
const available = Boolean(chromium) && existsSync(chromium);
if (!available && process.env.CI) throw new Error(`Chromium introuvable pour le rendu PDF (${chromium || 'aucun chemin'})`);

const doc: PrintableSalesDocument = {
  kind: 'invoice',
  number: 'FA-2026-00042',
  title: 'Refonte Polyweb',
  status: 'ISSUED',
  currency: 'EUR',
  customerName: 'ACME Corp',
  customerAddress: '1 rue de Paris',
  customerVatNumber: 'FR12345678901',
  customerEmail: 'billing@acme.test',
  issueDate: '2026-10-01',
  dueDate: '2026-10-31',
  validUntil: null,
  netMinor: 150000,
  taxMinor: 30000,
  grossMinor: 180000,
  paidMinor: 0,
  creditedMinor: 0,
  taxMention: null,
  notes: 'Merci',
  lines: [{ description: 'Integration CMS', quantity: '3', unitPriceMinor: 50000, discountPercent: '0', ratePercent: '20', netMinor: 150000 }],
};

describe.skipIf(!available)('PDF des documents de vente (Puppeteer)', () => {
  const renderer = makePuppeteerPdfRenderer(chromium);
  const render = (locale: 'fr' | 'en' | 'ar') =>
    Effect.runPromise(renderSalesDocumentPdf(doc, { locale, sellerName: 'Polyweb SAS' }).pipe(Effect.provideService(PdfRenderer, renderer)));

  afterAll(async () => {
    await closePdfBrowser();
  });

  it('fr : PDF valide, libellés et données extraits', async () => {
    const pdf = await render('fr');
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    const text = extractPdfText(pdf);
    for (const needle of ['Facture FA-2026-00042', 'ACME Corp', 'Polyweb SAS', 'Integration CMS', 'Total TTC', '1 800,00']) {
      expect(pdfTextIncludes(text, needle), needle).toBe(true);
    }
  }, 60_000);

  it('en : libellés anglais', async () => {
    const text = extractPdfText(await render('en'));
    for (const needle of ['Invoice FA-2026-00042', 'ACME Corp', '1,800.00']) expect(pdfTextIncludes(text, needle), needle).toBe(true);
    expect(pdfTextIncludes(text, 'Facture')).toBe(false);
  }, 60_000);

  it('ar : texte arabe rendu (RTL) et données latines intactes', async () => {
    const text = extractPdfText(await render('ar'));
    for (const needle of ['FA-2026-00042', 'ACME Corp', 'Integration CMS']) expect(pdfTextIncludes(text, needle), needle).toBe(true);
    expect(arabicCharCount(text)).toBeGreaterThan(20);
    expect(pdfTextIncludes(text, 'Invoice')).toBe(false);
  }, 60_000);

  it('réutilise le navigateur (rendus successifs rapides)', async () => {
    const started = Date.now();
    await Promise.all([render('fr'), render('en')]);
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 60_000);

  it('délai dépassé → DocumentRenderError (timeout ou render), jamais de blocage', async () => {
    const exit = await Effect.runPromiseExit(renderer.render('<p>x</p>', { timeoutMs: 1 }));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(String(exit.cause)).toMatch(/timeout|render/);
  }, 60_000);

  it('aucune ressource distante chargée', async () => {
    const pdf = await Effect.runPromise(renderer.render('<!doctype html><img src="http://127.0.0.1:9/x.png"><link rel="stylesheet" href="http://127.0.0.1:9/a.css"><p>Offline OK</p>', { timeoutMs: 5_000 }));
    expect(pdfTextIncludes(extractPdfText(pdf), 'Offline OK')).toBe(true);
  }, 60_000);
});

describe('PDF sans Chromium', () => {
  it('échoue proprement avec reason "unavailable"', async () => {
    const exit = await Effect.runPromiseExit(makePuppeteerPdfRenderer(null).render('<p>x</p>'));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain('unavailable');
  });
});
