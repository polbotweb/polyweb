/**
 * Rendu PDF réel (Puppeteer + Chromium) des documents de vente en fr / en / ar, avec extraction
 * du texte. Chromium : `PDF_CHROMIUM_PATH`, sinon celui de Playwright (installé en CI).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Effect, Exit } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { PdfRenderer } from '@/core/documents';
import { embedFacturX, FACTURX_XML_FILENAME } from '@/core/einvoice';
import { salesFacturXml } from '@/modules/sales/domain/einvoice';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, type PDFRawStream } from 'pdf-lib';
import { closePdfBrowser, makePuppeteerPdfRenderer, pdfLaunchOptions } from '@/lib/pdf/puppeteer';
import { renderSalesDocumentPdf, type PrintableSalesDocument } from '@/modules/sales/documents';
import { validateFacturXsd } from '../helpers/factur-x-xsd';
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

  it('Chromium ne survit pas au processus Node tué (SIGKILL, ex. arrêt du webServer Playwright)', async () => {
    const script = `import('puppeteer-core').then(async ({ launch }) => { const b = await launch(JSON.parse(process.env.OPTS)); console.log('PID ' + b.process().pid); setInterval(() => {}, 1000); });`;
    const child = spawn(process.execPath, ['-e', script], { env: { ...process.env, OPTS: JSON.stringify(pdfLaunchOptions(chromium)) }, stdio: ['ignore', 'pipe', 'inherit'] });
    const chromePid = await new Promise<number>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => { const match = /PID (\d+)/.exec(String(chunk)); if (match) resolve(Number(match[1])); });
      child.once('exit', () => reject(new Error('processus enfant terminé avant le lancement de Chromium')));
    });
    const alive = () => { try { process.kill(chromePid, 0); return true; } catch { return false; } };
    expect(alive()).toBe(true);
    child.kill('SIGKILL');
    try {
      await expect.poll(alive, { timeout: 10_000 }).toBe(false);
    } finally {
      if (alive()) process.kill(chromePid, 'SIGKILL');
    }
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

describe.skipIf(!available)('Factur-X : PDF Chromium réel → PDF/A-3B', () => {
  const renderer = makePuppeteerPdfRenderer(chromium);
  const seller = {
    legalName: 'Polyweb SAS', vatNumber: 'FR32123456782', legalId: '732829320', legalIdScheme: '0002',
    addressLine1: '1 rue de la Paix', addressLine2: null, postcode: '75002', city: 'Paris', country: 'FR',
    email: 'factures@polyweb.test', iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP',
  };

  afterAll(async () => {
    await closePdfBrowser();
  });

  it('XML joint extractible et valide XSD, polices embarquées, page conservée', async () => {
    const source = { ...doc, customerCountry: 'FR', sourceDocumentId: null, related: [], lines: doc.lines.map((line) => ({ ...line, taxCategory: 'standard' })) };
    const visual = await Effect.runPromise(renderSalesDocumentPdf(doc, { locale: 'fr', seller }).pipe(Effect.provideService(PdfRenderer, renderer)));
    const { xml } = await Effect.runPromise(salesFacturXml(source, seller, 'fr'));
    const pdf = await Effect.runPromise(embedFacturX(visual, xml, { title: 'FA-2026-00042', author: seller.legalName }));

    const loaded = await PDFDocument.load(pdf, { updateMetadata: false });
    expect(loaded.getPageCount()).toBe((await PDFDocument.load(visual)).getPageCount());
    const spec = loaded.catalog.lookup(PDFName.of('AF'), PDFArray).lookup(0, PDFDict);
    const file = spec.lookup(PDFName.of('EF'), PDFDict).lookup(PDFName.of('F')) as PDFRawStream;
    const embedded = new TextDecoder().decode(decodePDFRawStream(file).decode());
    expect(embedded).toBe(xml);
    expect((await validateFacturXsd(embedded)).errors).toEqual([]);
    expect(String(spec.get(PDFName.of('F')))).toContain(FACTURX_XML_FILENAME);
    expect(loaded.context.trailerInfo.Encrypt).toBeUndefined();
    // PDF/A (ISO 19005-3 §6.2.11.4) : toute police embarquée — Type3 via ses CharProcs, sinon FontFile / FontFile2 / FontFile3.
    const dicts = loaded.context.enumerateIndirectObjects().map(([, object]) => object).filter((object) => object instanceof PDFDict);
    const fonts = dicts.filter((font) => font.get(PDFName.of('Type'))?.toString() === '/Font');
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) {
      const subtype = font.get(PDFName.of('Subtype'))?.toString();
      if (subtype === '/Type3') expect(font.has(PDFName.of('CharProcs'))).toBe(true);
      else {
        const holder = subtype === '/Type0' ? font.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict) : font;
        const descriptor = holder.lookup(PDFName.of('FontDescriptor'), PDFDict);
        expect(['FontFile', 'FontFile2', 'FontFile3'].some((key) => descriptor.has(PDFName.of(key))), String(font.get(PDFName.of('BaseFont')))).toBe(true);
      }
    }
    expect(extractPdfText(pdf).length).toBeGreaterThan(0);
  }, 60_000);
});
