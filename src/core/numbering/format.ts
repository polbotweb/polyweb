/**
 * core/numbering — format pur des numéros de document.
 *
 * Motif : texte libre + jetons `{prefix}`, `{YYYY}`, `{YY}`, `{MM}`, `{seq}` ou `{seq:N}`
 * (N = 1..12 chiffres, complété par des zéros). `{seq}` est obligatoire et unique.
 * Ex. `{prefix}-{YYYY}-{seq:5}` → `FA-2026-00042`.
 */
import { Effect } from 'effect';
import { InvalidNumberingDateError, InvalidNumberingPatternError } from './errors';

export const NUMBERING_RESETS = ['never', 'yearly', 'monthly'] as const;
export type NumberingReset = (typeof NUMBERING_RESETS)[number];

export interface NumberingScheme {
  readonly pattern: string;
  readonly reset: NumberingReset;
  readonly prefix?: string;
}

const TOKEN = /\{([A-Za-z]+)(?::(\d+))?\}/g;
const KNOWN = new Set(['prefix', 'YYYY', 'YY', 'MM', 'seq']);

/** Date ISO (`YYYY-MM-DD` ou date-heure) → { year, month } (UTC). */
const dateParts = (date: string) => {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(date);
  const month = match ? Number(match[2]) : 0;
  return match && month >= 1 && month <= 12
    ? Effect.succeed({ year: match[1], month: match[2] })
    : Effect.fail(new InvalidNumberingDateError({ date }));
};

/** Vérifie le motif : jetons connus, un seul `{seq}`, largeur 1..12. */
export const validatePattern = (pattern: string): Effect.Effect<string, InvalidNumberingPatternError> => {
  const tokens = [...pattern.matchAll(TOKEN)];
  const unknown = tokens.find((t) => !KNOWN.has(t[1]));
  if (unknown) return Effect.fail(new InvalidNumberingPatternError({ pattern, reason: `jeton inconnu ${unknown[0]}` }));
  const seq = tokens.filter((t) => t[1] === 'seq');
  if (seq.length !== 1) return Effect.fail(new InvalidNumberingPatternError({ pattern, reason: 'un et un seul {seq} requis' }));
  const width = seq[0][2] === undefined ? 1 : Number(seq[0][2]);
  if (width < 1 || width > 12) return Effect.fail(new InvalidNumberingPatternError({ pattern, reason: 'largeur de {seq} entre 1 et 12' }));
  if (tokens.some((t) => t[1] !== 'seq' && t[2] !== undefined)) return Effect.fail(new InvalidNumberingPatternError({ pattern, reason: 'seul {seq} accepte une largeur' }));
  return Effect.succeed(pattern);
};

/** Clé de période de la séquence : `""` (jamais remise à zéro), `YYYY` ou `YYYY-MM`. */
export const numberingPeriod = (reset: NumberingReset, date: string): Effect.Effect<string, InvalidNumberingDateError> =>
  reset === 'never' ? Effect.succeed('') : Effect.map(dateParts(date), ({ year, month }) => (reset === 'yearly' ? year : `${year}-${month}`));

/** Numéro formaté pour la valeur `value` (≥ 1) à la date `date`. */
export const formatDocumentNumber = (scheme: NumberingScheme, value: number, date: string) =>
  Effect.gen(function* () {
    const pattern = yield* validatePattern(scheme.pattern);
    if (!Number.isSafeInteger(value) || value < 1) return yield* new InvalidNumberingPatternError({ pattern, reason: `valeur de séquence invalide ${value}` });
    const { year, month } = yield* dateParts(date);
    return pattern.replace(TOKEN, (_, name: string, width?: string) => {
      switch (name) {
        case 'prefix': return scheme.prefix ?? '';
        case 'YYYY': return year;
        case 'YY': return year.slice(2);
        case 'MM': return month;
        default: return String(value).padStart(width === undefined ? 1 : Number(width), '0');
      }
    });
  });
