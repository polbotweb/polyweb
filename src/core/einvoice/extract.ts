/**
 * Extraction du XML embarqué dans un PDF/A-3 Factur-X (fichier joint factur-x.xml / zugferd-invoice.xml).
 * Utilise pdf-lib déjà présent, sans nouvelle dépendance. Les PDF chiffrés sont refusés.
 */
import { inflateSync } from "node:zlib";
import { Effect } from "effect";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef } from "pdf-lib";
import { FacturXEmbedError } from "./errors";

const FILENAMES = new Set(["factur-x.xml", "zugferd-invoice.xml", "xrechnung.xml", "cii.xml"]);

const asDict = (value: unknown): PDFDict | null => (value instanceof PDFDict ? value : null);

const lookupName = (dict: PDFDict, key: string) => {
  const direct = dict.lookupMaybe(PDFName.of(key), PDFDict);
  if (direct) return direct;
  const ref = dict.get(PDFName.of(key));
  return ref instanceof PDFRef ? asDict(dict.context.lookup(ref, PDFDict)) : null;
};

const fileSpecName = (spec: PDFDict): string => {
  const uf = spec.get(PDFName.of("UF"));
  const f = spec.get(PDFName.of("F"));
  const raw = (uf && "decodeText" in uf && typeof uf.decodeText === "function" ? uf.decodeText() : null)
    ?? (f && "decodeText" in f && typeof f.decodeText === "function" ? f.decodeText() : null)
    ?? "";
  return String(raw).toLowerCase();
};

const streamOf = (spec: PDFDict): PDFRawStream | null => {
  const ef = spec.lookupMaybe(PDFName.of("EF"), PDFDict) ?? lookupName(spec, "EF");
  if (!ef) return null;
  for (const key of ["F", "UF", "DOS", "Mac", "Unix"]) {
    const ref = ef.get(PDFName.of(key));
    if (ref instanceof PDFRawStream) return ref;
    if (ref instanceof PDFRef) {
      const looked = spec.context.lookup(ref);
      if (looked instanceof PDFRawStream) return looked;
    }
  }
  return null;
};

const decodeStream = (stream: PDFRawStream): string | null => {
  try {
    const raw = stream.getContents();
    const filter = stream.dict.get(PDFName.of("Filter"));
    const names = filter instanceof PDFName ? [filter.decodeText?.() ?? filter.toString()] : [];
    const flate = names.some((name) => /Flate/i.test(name)) || (filter && String(filter).includes("Flate"));
    const bytes = flate ? inflateSync(raw) : raw;
    const text = new TextDecoder("utf-8").decode(bytes);
    return text.includes("<") ? text : null;
  } catch {
    return null;
  }
};

const collectSpecs = (doc: PDFDocument): PDFDict[] => {
  const specs: PDFDict[] = [];
  const catalog = doc.catalog;
  const af = catalog.get(PDFName.of("AF"));
  const resolved = af instanceof PDFRef ? catalog.context.lookup(af) : af;
  const pushRef = (item: unknown) => {
    const spec = item instanceof PDFRef ? asDict(catalog.context.lookup(item)) : asDict(item);
    if (spec) specs.push(spec);
  };
  if (resolved instanceof PDFArray) {
    for (let i = 0; i < resolved.size(); i++) pushRef(resolved.get(i));
  } else if (resolved instanceof PDFDict) specs.push(resolved);
  const names = catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  const embedded = names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
  const nameTree = embedded?.lookupMaybe(PDFName.of("Names"), PDFArray);
  if (nameTree) {
    for (let i = 1; i < nameTree.size(); i += 2) {
      const item = nameTree.get(i);
      const spec = item instanceof PDFRef ? asDict(catalog.context.lookup(item)) : asDict(item);
      if (spec) specs.push(spec);
    }
  }
  return specs;
};

const extractSync = async (pdf: Uint8Array): Promise<string> => {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const specs = collectSpecs(doc);
  const preferred = specs.find((spec) => FILENAMES.has(fileSpecName(spec))) ?? specs[0];
  if (!preferred) throw new FacturXEmbedError({ reason: "invalid-pdf", cause: new Error("aucun fichier joint") });
  const stream = streamOf(preferred);
  const xml = stream ? decodeStream(stream) : null;
  if (!xml) throw new FacturXEmbedError({ reason: "invalid-pdf", cause: new Error("XML embarqué illisible") });
  return xml;
};

/** Extrait le XML CII/UBL joint à un PDF Factur-X / ZUGFeRD. */
export const extractEmbeddedInvoiceXml = (pdf: Uint8Array): Effect.Effect<string, FacturXEmbedError> =>
  Effect.tryPromise({
    try: () => extractSync(pdf),
    catch: (cause) =>
      cause instanceof FacturXEmbedError
        ? cause
        : new FacturXEmbedError({ reason: cause instanceof Error && /encrypt/i.test(cause.message) ? "encrypted" : "invalid-pdf", cause }),
  });
