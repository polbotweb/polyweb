/**
 * Extraction de texte minimale pour les tests (PDF produits par Chromium / Skia) — sans dépendance :
 * flux FlateDecode (zlib), polices référencées par `/Font << … >>`, CMaps `ToUnicode`
 * (bfchar / bfrange), chaînes hexadécimales des opérateurs `Tj` / `TJ`. Le texte arabe sort
 * dans l'ordre visuel des glyphes : comparer avec `pdfTextIncludes`, qui tolère l'inversion.
 * Chromium embarque les polices variables en Type3 : certains glyphes arabes façonnés n'ont pas
 * de correspondance Unicode (`<0000>`) — ils sont ignorés.
 */
import { inflateSync } from 'node:zlib';

type CMap = Map<string, string>;

const utf16 = (hex: string) => {
  let out = '';
  for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return out;
};

const parseCMap = (text: string): CMap => {
  const map: CMap = new Map();
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, src, dst] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) map.set(src.toLowerCase(), utf16(dst));
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, lo, hi, rest] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const start = parseInt(lo, 16);
      const end = parseInt(hi, 16);
      const list = rest.startsWith('[') ? [...rest.matchAll(/<([0-9a-fA-F]*)>/g)].map((m) => m[1]) : null;
      const base = list ? 0 : parseInt(rest.slice(1, -1), 16);
      for (let code = start; code <= end && code - start < 65536; code++) {
        const key = code.toString(16).padStart(lo.length, '0');
        map.set(key, list ? utf16(list[code - start] ?? '') : String.fromCharCode(base + code - start));
      }
    }
  }
  return map;
};

const streamOf = (raw: string): string | null => {
  const match = /stream\r?\n/.exec(raw);
  if (!match) return null;
  const end = raw.lastIndexOf('endstream');
  let body = raw.slice(match.index + match[0].length, end < 0 ? undefined : end);
  const length = /\/Length (\d+)(?!\s+\d+\s+R)/.exec(raw.slice(0, match.index));
  if (length) body = body.slice(0, Number(length[1]));
  const bytes = Buffer.from(body, 'latin1');
  if (!/\/FlateDecode/.test(raw.slice(0, match.index))) return bytes.toString('latin1');
  try { return inflateSync(bytes).toString('latin1'); } catch { return null; }
};

/** Texte du PDF : un fragment par opérateur `Tj`/`TJ`, séparés par des espaces. */
export function extractPdfText(pdf: Uint8Array): string {
  const source = Buffer.from(pdf).toString('latin1');
  const objects = new Map<string, string>();
  for (const [, id, body] of source.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) objects.set(id, body);

  const cmapOfFontObject = new Map<string, CMap>();
  for (const [id, body] of objects) {
    const ref = /\/ToUnicode (\d+) 0 R/.exec(body);
    const cmapSource = ref ? objects.get(ref[1]) : undefined;
    const text = cmapSource ? streamOf(cmapSource) : null;
    if (text) cmapOfFontObject.set(id, parseCMap(text));
  }
  const fontByName = new Map<string, CMap>();
  for (const [, entries] of source.matchAll(/\/Font\s*<<([^>]*)>>/g)) {
    for (const [, name, ref] of entries.matchAll(/\/([^\s/]+)\s+(\d+) 0 R/g)) {
      const cmap = cmapOfFontObject.get(ref);
      if (cmap) fontByName.set(name, cmap);
    }
  }

  const parts: string[] = [];
  for (const body of objects.values()) {
    if (/\/ToUnicode|\/Type \/XRef/.test(body)) continue;
    const content = streamOf(body);
    if (!content || !/\bTf\b/.test(content)) continue;
    let cmap: CMap | undefined;
    for (const token of content.matchAll(/\/([^\s/]+)\s+[\d.]+\s+Tf|(\[(?:[^\]]*)\]\s*TJ|<[0-9a-fA-F]*>\s*Tj)/g)) {
      if (token[1]) { cmap = fontByName.get(token[1]); continue; }
      const width = cmap?.keys().next().value?.length ?? 4;
      let text = '';
      for (const [, hex] of token[2].matchAll(/<([0-9a-fA-F]*)>/g)) {
        for (let i = 0; i + width <= hex.length; i += width) text += cmap?.get(hex.slice(i, i + width).toLowerCase()) ?? '';
      }
      parts.push(text);
    }
  }
  return parts.join(' ').replace(/\u0000/g, '');
}

/** Nombre de caractères arabes (lettres de base et formes de présentation) dans le texte extrait. */
export const arabicCharCount = (text: string) => (text.match(/[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []).length;

const compact = (value: string) => value.normalize('NFKC').replace(/\s+/g, '');

/** Le texte extrait contient-il `needle` (espaces ignorés ; ordre logique ou visuel pour le RTL) ? */
export const pdfTextIncludes = (text: string, needle: string) => {
  const hay = compact(text);
  const target = compact(needle);
  return hay.includes(target) || hay.includes([...target].reverse().join(''));
};
