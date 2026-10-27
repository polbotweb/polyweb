import { Effect, Exit } from 'effect';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { FACTURX_NAMESPACE, FACTURX_XML_FILENAME, embedFacturX, facturXmp, srgbIccProfile } from '@/core/einvoice';

const date = new Date('2026-10-27T10:00:00Z');
const xml = '<?xml version="1.0" encoding="UTF-8"?><rsm:CrossIndustryInvoice xmlns:rsm="urn:x"/>';

const visualPdf = async () => {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return doc.save();
};

const text = (stream: PDFRawStream) => {
  expect(stream).toBeInstanceOf(PDFRawStream);
  return new TextDecoder().decode(decodePDFRawStream(stream).decode());
};

describe('core/einvoice — profil ICC sRGB', () => {
  it('en-tête ICC v2 cohérent (taille, acsp, RGB/XYZ, 9 balises)', () => {
    const icc = srgbIccProfile();
    const view = new DataView(icc.buffer, icc.byteOffset, icc.byteLength);
    expect(view.getUint32(0)).toBe(icc.length);
    expect(view.getUint32(8)).toBe(0x02100000);
    const sig = (at: number) => String.fromCharCode(...icc.slice(at, at + 4));
    expect([sig(12), sig(16), sig(20), sig(36)]).toEqual(['mntr', 'RGB ', 'XYZ ', 'acsp']);
    expect(view.getUint32(128)).toBe(9);
    for (let index = 0; index < 9; index++) {
      const offset = view.getUint32(132 + index * 12 + 4);
      const size = view.getUint32(132 + index * 12 + 8);
      expect(offset % 4).toBe(0);
      expect(offset + size).toBeLessThanOrEqual(icc.length);
    }
    expect(srgbIccProfile()).toEqual(icc);
  });
});

describe('core/einvoice — PDF/A-3 Factur-X', () => {
  it('joint factur-x.xml (Alternative), OutputIntent, XMP PDF/A-3B + fx, /ID', async () => {
    const out = await Effect.runPromise(embedFacturX(await visualPdf(), xml, { title: 'Facture F-1 <&>', author: 'Polyweb', date }));
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    const catalog = doc.catalog;

    const af = catalog.lookup(PDFName.of('AF'), PDFArray);
    const spec = af.lookup(0, PDFDict);
    expect(spec.get(PDFName.of('AFRelationship'))).toEqual(PDFName.of('Alternative'));
    expect((spec.lookup(PDFName.of('F')) as PDFString).decodeText()).toBe(FACTURX_XML_FILENAME);
    expect((spec.lookup(PDFName.of('UF')) as PDFHexString).decodeText()).toBe(FACTURX_XML_FILENAME);
    const file = spec.lookup(PDFName.of('EF'), PDFDict).lookup(PDFName.of('F')) as PDFRawStream;
    expect(file.dict.get(PDFName.of('Subtype'))?.toString()).toBe('/text#2Fxml');
    expect(text(file)).toBe(xml);
    const names = catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict).lookup(PDFName.of('Names'), PDFArray);
    expect((names.lookup(0) as PDFString).decodeText()).toBe(FACTURX_XML_FILENAME);
    expect(names.get(1)).toEqual(af.get(0));

    const intent = catalog.lookup(PDFName.of('OutputIntents'), PDFArray).lookup(0, PDFDict);
    expect(intent.get(PDFName.of('S'))).toEqual(PDFName.of('GTS_PDFA1'));
    const icc = intent.lookup(PDFName.of('DestOutputProfile')) as PDFRawStream;
    expect(icc.dict.get(PDFName.of('N'))?.toString()).toBe('3');
    expect(decodePDFRawStream(icc).decode()).toEqual(srgbIccProfile());

    const metadata = catalog.lookup(PDFName.of('Metadata')) as PDFRawStream;
    expect(metadata.dict.get(PDFName.of('Filter'))).toBeUndefined();
    const xmp = text(metadata);
    expect(xmp).toContain('<pdfaid:part>3</pdfaid:part>');
    expect(xmp).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
    expect(xmp).toContain('<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>');
    expect(xmp).toContain(`<fx:DocumentFileName>${FACTURX_XML_FILENAME}</fx:DocumentFileName>`);
    expect(xmp).toContain(`<pdfaSchema:namespaceURI>${FACTURX_NAMESPACE}</pdfaSchema:namespaceURI>`);
    expect(xmp).toContain('Facture F-1 &lt;&amp;&gt;');
    expect(xmp).toContain('<xmp:CreateDate>2026-10-27T10:00:00Z</xmp:CreateDate>');

    expect(doc.getTitle()).toBe('Facture F-1 <&>');
    expect(doc.getProducer()).toBe('polyweb');
    expect(doc.getCreationDate()?.toISOString()).toBe(date.toISOString());
    expect(new TextDecoder('latin1').decode(out)).toMatch(/\/ID \[ <[0-9A-F]{32}> <[0-9A-F]{32}> \]/i);
    expect(doc.getPageCount()).toBe(1);
  });

  it('XMP : XML bien formé avec paquet xpacket', () => {
    const xmp = facturXmp({ title: 't', producer: 'p', date });
    expect(xmp.startsWith('<?xpacket begin=')).toBe(true);
    expect(xmp.trimEnd().endsWith('<?xpacket end="w"?>')).toBe(true);
  });

  it('PDF invalide → FacturXEmbedError invalid-pdf', async () => {
    const exit = await Effect.runPromiseExit(embedFacturX(new TextEncoder().encode('pas un pdf'), xml, { title: 't' }));
    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toContain('invalid-pdf');
  });
});
