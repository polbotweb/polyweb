/**
 * Point d'entrée des lecteurs de relevés : décodage (UTF-8 strict, sinon Windows-1252 ; encodage
 * explicite du profil CSV ; déclaration XML), détection automatique du format (forçage possible),
 * contrôles de taille, puis lecteur dédié. Aucune dépendance : `TextDecoder` natif de Node.
 */
import { Effect } from "effect";
import type { CsvEncoding, StatementFormat } from "../constants";
import { StatementParseError } from "../errors";
import { camtVariant, parseCamt } from "./camt";
import { looksLikeCfonb, parseCfonb120 } from "./cfonb";
import { parseCsv, type CsvProfile } from "./csv";
import { parseMt940 } from "./mt940";
import { parseOfx } from "./ofx";
import { parseQif } from "./qif";
import type { ParsedFile, ParseOptions } from "./types";

export * from "./types";
export { CSV_PRESETS, DEFAULT_CSV_PROFILE, previewCsv, validateCsvProfile, type CsvProfile } from "./csv";

/** Décode les octets : encodage imposé, sinon déclaration XML, sinon UTF-8 strict puis Windows-1252. */
export const decodeStatement = (bytes: Uint8Array, encoding?: CsvEncoding): Effect.Effect<string, StatementParseError> =>
  Effect.try({
    try: () => {
      const strip = (text: string) => text.replace(/^\uFEFF/, "");
      if (encoding && encoding !== "utf-8") return strip(new TextDecoder(encoding).decode(bytes));
      const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
      const declared = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1]?.toLowerCase();
      if (declared && declared !== "utf-8" && declared !== "utf8") return strip(new TextDecoder(declared).decode(bytes));
      try { return strip(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { if (encoding === "utf-8") throw new Error("utf-8 invalide"); return strip(new TextDecoder("windows-1252").decode(bytes)); }
    },
    catch: (error) => new StatementParseError({ format: "csv", reason: "encoding", detail: error instanceof Error ? error.message : "encodage illisible" }),
  });

/** Format probable d'un contenu décodé ; `csv` par défaut. */
export const detectFormat = (text: string): StatementFormat => {
  const head = text.slice(0, 8192).replace(/^\uFEFF/, "").trimStart();
  if (/^OFXHEADER:/i.test(head) || (/<OFX>/i.test(head) && !/<Document/i.test(head))) return "ofx";
  if (head.startsWith("<")) return camtVariant(head) ?? "camt053";
  if (/^!(Type|Account|Option)/im.test(head)) return "qif";
  if (/(^|\n|\{4:\s*\n?):20:/.test(head) && /:61:|:62[FM]:|:60[FM]:|:34F:/.test(head)) return /:34F:|:13D:/.test(head) && !/:60[FM]:/.test(head) ? "mt942" : "mt940";
  if (looksLikeCfonb(head)) return "cfonb120";
  return "csv";
};

export interface ParseStatementInput {
  readonly bytes: Uint8Array;
  /** Format imposé (sinon détecté). */
  readonly format?: StatementFormat | null;
  readonly csvProfile?: CsvProfile | null;
  readonly allowedFormats: readonly StatementFormat[];
  readonly maxBytes: number;
  readonly options: ParseOptions;
}

const FAMILY: Record<StatementFormat, StatementFormat[]> = {
  camt053: ["camt053", "camt052", "camt054"], camt052: ["camt053", "camt052", "camt054"], camt054: ["camt053", "camt052", "camt054"],
  mt940: ["mt940", "mt942"], mt942: ["mt940", "mt942"], cfonb120: ["cfonb120"], ofx: ["ofx"], qif: ["qif"], csv: ["csv"],
};

/** Lit un fichier de relevé complet. Le format réel (variante CAMT, MT942) est vérifié contre les formats autorisés. */
export const parseStatementFile = (input: ParseStatementInput): Effect.Effect<ParsedFile, StatementParseError> =>
  Effect.gen(function* () {
    if (input.bytes.byteLength === 0) return yield* new StatementParseError({ format: input.format ?? "csv", reason: "empty", detail: "fichier vide" });
    if (input.bytes.byteLength > input.maxBytes) return yield* new StatementParseError({ format: input.format ?? "csv", reason: "too_large", detail: `${input.bytes.byteLength} > ${input.maxBytes} octets` });
    const encoding = input.format === "csv" || (!input.format && input.csvProfile) ? input.csvProfile?.encoding : undefined;
    const text = yield* decodeStatement(input.bytes, encoding);
    const detected = detectFormat(text);
    const format = input.format && FAMILY[input.format].includes(detected) ? detected : input.format ?? detected;
    if (input.format && !FAMILY[input.format].includes(detected) && detected !== "csv") {
      return yield* new StatementParseError({ format: input.format, reason: "format", detail: `le contenu ressemble à ${detected}` });
    }
    const parsed = yield* (() => {
      switch (format) {
        case "camt053": case "camt052": case "camt054": return parseCamt(text, input.options);
        case "mt940": case "mt942": return parseMt940(text, input.options);
        case "cfonb120": return parseCfonb120(text, input.options);
        case "ofx": return parseOfx(text, input.options);
        case "qif": return parseQif(text, input.options);
        case "csv": {
          if (!input.csvProfile) return Effect.fail(new StatementParseError({ format: "csv", reason: "structure", detail: "profil CSV requis (colonnes)" }));
          return parseCsv(text, input.csvProfile, input.options);
        }
      }
    })();
    if (!input.allowedFormats.includes(parsed.format)) return yield* new StatementParseError({ format: parsed.format, reason: "forbidden_format", detail: `format ${parsed.format} désactivé dans les réglages` });
    return parsed;
  });
