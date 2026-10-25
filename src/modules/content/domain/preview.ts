/**
 * Liens de prévisualisation signés (brique f) — Effect natif.
 *
 * Jeton sans état : `<payload base64url>.<HMAC-SHA256 base64url>` ;
 * payload = { e: entryId, l: locale, x: expiration (s), v?: version figée }.
 * La clé HMAC est dérivée de POLYWEB_SIGNING_SECRET (rotation = révocation
 * de tous les liens). Un lien sans `v` montre toujours l'état courant
 * (brouillon compris) ; avec `v`, l'instantané de cette révision.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Clock, Effect, Schema } from 'effect';
import { AppConfig } from '@/lib/effect/config';
import { DbError, NotFoundError, UnauthorizedError } from '@/lib/effect/errors';
import { decode } from '@/lib/effect/schema';
import { getEntryById, pickTranslation, type EntryTranslation, type FullEntry } from './entries';
import { getRevision } from './revisions';

export const PreviewClaims = Schema.Struct({
  e: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(64))),
  l: Schema.String.pipe(Schema.check(Schema.isMaxLength(8))),
  x: Schema.Number.pipe(Schema.check(Schema.isInt())),
  v: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isInt()))),
});
export type PreviewClaims = typeof PreviewClaims.Type;

export const PREVIEW_TTL_CHOICES = { '1h': 3600, '24h': 86_400, '7j': 604_800, '30j': 2_592_000 } as const;
const MAX_TTL = 2_592_000;

const mac = (secret: string, payload: string) =>
  createHmac('sha256', `polyweb:preview:${secret}`).update(payload).digest('base64url');

/** Signe des claims (exposé pour les tests et outils). */
export function signClaims(secret: string, claims: PreviewClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${mac(secret, payload)}`;
}

export const createPreviewToken = (input: { entryId: string; locale: string; ttlSeconds: number; version?: number }) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const now = Math.floor((yield* Clock.currentTimeMillis) / 1000);
    const claims: PreviewClaims = {
      e: input.entryId,
      l: input.locale,
      x: now + Math.min(Math.max(60, Math.floor(input.ttlSeconds)), MAX_TTL),
      ...(input.version !== undefined ? { v: input.version } : {}),
    };
    return { token: signClaims(config.signingSecret, claims), claims };
  });

const invalid = (reason: string) => new UnauthorizedError({ reason });

export const verifyPreviewToken = (token: string) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const [payload, sig, extra] = token.split('.');
    if (!payload || !sig || extra !== undefined || token.length > 1024) return yield* invalid('Malformed preview token');
    const expected = Buffer.from(mac(config.signingSecret, payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return yield* invalid('Bad preview signature');
    const raw = yield* Effect.try({ try: () => JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown, catch: () => invalid('Malformed preview payload') });
    const claims = yield* decode(PreviewClaims)(raw).pipe(Effect.mapError(() => invalid('Malformed preview payload')));
    const now = Math.floor((yield* Clock.currentTimeMillis) / 1000);
    if (claims.x <= now) return yield* invalid('Preview link expired');
    return claims;
  });

export interface PreviewView {
  readonly entry: FullEntry;
  readonly translation: EntryTranslation;
  readonly claims: PreviewClaims;
  /** Version affichée (courante ou figée). */
  readonly version: number;
  readonly pinned: boolean;
}

/** Vérifie le jeton puis charge l'entrée (état courant ou révision figée). */
export const loadPreview = (token: string) =>
  Effect.gen(function* () {
    const claims = yield* verifyPreviewToken(token);
    const entry = yield* Effect.tryPromise({ try: () => getEntryById(claims.e), catch: (cause) => new DbError({ operation: 'preview.entry', cause }) });
    if (!entry) return yield* new NotFoundError({ entity: 'Entry', id: claims.e });
    let view: FullEntry = entry;
    if (claims.v !== undefined) {
      const rev = yield* Effect.tryPromise({ try: () => getRevision(entry.id, claims.v!), catch: (cause) => new DbError({ operation: 'preview.revision', cause }) });
      if (!rev) return yield* new NotFoundError({ entity: 'Revision', id: String(claims.v) });
      const s = rev.snapshot;
      view = {
        ...entry,
        slug: s.slug,
        status: s.status,
        sharedData: s.sharedData,
        version: rev.version,
        translations: s.translations.map(
          (t): EntryTranslation => ({
            id: `${entry.id}:${t.locale}:v${rev.version}`,
            entryId: entry.id,
            locale: t.locale,
            title: t.title,
            data: t.data,
            blocks: t.blocks,
            seo: t.seo,
            updatedAt: rev.createdAt,
          }),
        ),
      };
    }
    const translation = pickTranslation(view, claims.l, 'fr');
    if (!translation) return yield* new NotFoundError({ entity: 'Translation', id: claims.l });
    return { entry: view, translation, claims, version: view.version, pinned: claims.v !== undefined } satisfies PreviewView;
  }).pipe(Effect.withSpan('content.preview.load'));
