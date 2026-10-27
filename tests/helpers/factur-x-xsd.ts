/** Validation XSD Factur-X 1.09 EN 16931 (xmllint compilé en WebAssembly, sans binaire système). */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateXML } from 'xmllint-wasm';

const XSD_DIR = join(import.meta.dirname, '..', 'fixtures', 'factur-x', 'xsd');
const MAIN = 'Factur-X_EN16931.xsd';

export const validateFacturXsd = async (xml: string) => {
  const files = readdirSync(XSD_DIR).filter((name) => name.endsWith('.xsd'));
  const load = (fileName: string) => ({ fileName, contents: readFileSync(join(XSD_DIR, fileName), 'utf8') });
  const result = await validateXML({
    xml: { fileName: 'factur-x.xml', contents: xml },
    schema: load(MAIN),
    preload: files.filter((name) => name !== MAIN).map(load),
  });
  return { valid: result.valid, errors: result.errors.map((error) => error.rawMessage) };
};
