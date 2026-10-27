/**
 * Assemblage Factur-X : PDF visuel (Chromium) + `factur-x.xml` → PDF/A-3B.
 * - fichier joint `factur-x.xml` (`/Subtype /text#2Fxml`, `/AFRelationship /Alternative`), référencé
 *   par `/AF` du catalogue et par l'arbre `/Names /EmbeddedFiles` ;
 * - `OutputIntent` GTS_PDFA1 avec un profil ICC sRGB (`./icc`) ;
 * - métadonnées XMP (`pdfaid:part=3`, `conformance=B`, schéma d'extension `fx` Factur-X 1.0,
 *   niveau `EN 16931`) cohérentes avec le dictionnaire `/Info` ;
 * - identifiant de fichier `/ID` dans la remorque. Aucun chiffrement, objets non compressés en flux d'objets.
 */
import { createHash } from "node:crypto";
import { Effect } from "effect";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from "pdf-lib";
import { FACTURX_XML_FILENAME, escapeXml } from "./cii";
import { FacturXEmbedError } from "./errors";
import { SRGB_ICC_DESCRIPTION, srgbIccProfile } from "./icc";

export const FACTURX_CONFORMANCE_LEVEL = "EN 16931";
export const FACTURX_NAMESPACE = "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#";

export interface FacturXPdfOptions {
  readonly title: string;
  readonly author?: string;
  /** Date de production (déterminisme des tests). */
  readonly date?: Date;
  readonly producer?: string;
}

const isoDate = (date: Date) => `${date.toISOString().slice(0, 19)}Z`;
/** Date PDF (`D:AAAAMMJJHHmmSSZ`). */
const pdfDate = (date: Date) => `D:${date.toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z`;

export const facturXmp = (options: { readonly title: string; readonly author?: string; readonly producer: string; readonly date: Date }) => {
  const date = isoDate(options.date);
  const field = (name: string, label: string) => `
            <rdf:li rdf:parseType="Resource">
              <pdfaProperty:name>${name}</pdfaProperty:name>
              <pdfaProperty:valueType>Text</pdfaProperty:valueType>
              <pdfaProperty:category>external</pdfaProperty:category>
              <pdfaProperty:description>${label}</pdfaProperty:description>
            </rdf:li>`;
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:format>application/pdf</dc:format>
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(options.title)}</rdf:li></rdf:Alt></dc:title>${options.author ? `
      <dc:creator><rdf:Seq><rdf:li>${escapeXml(options.author)}</rdf:li></rdf:Seq></dc:creator>` : ""}
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreatorTool>${escapeXml(options.producer)}</xmp:CreatorTool>
      <xmp:CreateDate>${date}</xmp:CreateDate>
      <xmp:ModifyDate>${date}</xmp:ModifyDate>
      <xmp:MetadataDate>${date}</xmp:MetadataDate>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdf:Producer>${escapeXml(options.producer)}</pdf:Producer>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:fx="${FACTURX_NAMESPACE}">
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>${FACTURX_XML_FILENAME}</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>${FACTURX_CONFORMANCE_LEVEL}</fx:ConformanceLevel>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
        xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
        xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>${FACTURX_NAMESPACE}</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>${field("DocumentFileName", "The name of the embedded XML document")}${field("DocumentType", "The type of the hybrid document in capital letters, e.g. INVOICE or ORDER")}${field("Version", "The actual version of the standard applying to the embedded XML document")}${field("ConformanceLevel", "The conformance level of the embedded XML document")}
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
};

const embed = async (pdf: Uint8Array, xml: string, options: FacturXPdfOptions) => {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const context = doc.context;
  const date = options.date ?? new Date();
  const producer = options.producer ?? "polyweb";

  // Fichier joint factur-x.xml (relation « Alternative » : même contenu que le PDF visuel).
  const xmlBytes = new TextEncoder().encode(xml);
  const params = context.obj({ Size: PDFNumber.of(xmlBytes.length), ModDate: PDFString.of(pdfDate(date)), CheckSum: PDFHexString.of(createHash("md5").update(xmlBytes).digest("hex")) });
  const fileStream = context.flateStream(xmlBytes, { Type: "EmbeddedFile", Subtype: "text/xml", Params: params });
  const fileRef = context.register(fileStream);
  const fileSpec = context.obj({
    Type: "Filespec",
    F: PDFString.of(FACTURX_XML_FILENAME),
    UF: PDFHexString.fromText(FACTURX_XML_FILENAME),
    Desc: PDFString.of("Factur-X invoice"),
    AFRelationship: PDFName.of("Alternative"),
    EF: context.obj({ F: fileRef, UF: fileRef }),
  });
  const fileSpecRef = context.register(fileSpec);
  const catalog = doc.catalog;
  catalog.set(PDFName.of("AF"), context.obj([fileSpecRef]));
  const names = catalog.lookupMaybe(PDFName.of("Names"), PDFDict) ?? context.obj({});
  names.set(PDFName.of("EmbeddedFiles"), context.obj({ Names: [PDFString.of(FACTURX_XML_FILENAME), fileSpecRef] }));
  catalog.set(PDFName.of("Names"), names);

  // OutputIntent sRGB.
  const icc = srgbIccProfile();
  const iccRef = context.register(context.flateStream(icc, { N: 3 }));
  const intent = context.obj({
    Type: "OutputIntent", S: "GTS_PDFA1",
    OutputConditionIdentifier: PDFString.of(SRGB_ICC_DESCRIPTION), Info: PDFString.of(SRGB_ICC_DESCRIPTION),
    RegistryName: PDFString.of("http://www.color.org"), DestOutputProfile: iccRef,
  });
  catalog.set(PDFName.of("OutputIntents"), context.obj([intent]));

  // Métadonnées XMP (non compressées) + /Info cohérent.
  const xmp = facturXmp({ title: options.title, author: options.author, producer, date });
  const metadata = context.stream(new TextEncoder().encode(xmp), { Type: "Metadata", Subtype: "XML" });
  catalog.set(PDFName.of("Metadata"), context.register(metadata));
  catalog.set(PDFName.of("PageMode"), PDFName.of("UseAttachments"));
  doc.setTitle(options.title);
  if (options.author) doc.setAuthor(options.author);
  doc.setProducer(producer);
  doc.setCreator(producer);
  doc.setCreationDate(date);
  doc.setModificationDate(date);

  // Identifiant de fichier (PDF/A : /ID obligatoire).
  const id = PDFHexString.of(createHash("md5").update(pdf).update(xmlBytes).digest("hex"));
  context.trailerInfo.ID = context.obj([id, id]) as PDFArray;

  return doc.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false });
};

/** PDF visuel + XML CII → PDF/A-3B Factur-X. */
export const embedFacturX = (pdf: Uint8Array, xml: string, options: FacturXPdfOptions): Effect.Effect<Uint8Array, FacturXEmbedError> =>
  Effect.tryPromise({
    try: () => embed(pdf, xml, options),
    catch: (cause) => new FacturXEmbedError({ reason: cause instanceof Error && /encrypt/i.test(cause.message) ? "encrypted" : "invalid-pdf", cause }),
  });
