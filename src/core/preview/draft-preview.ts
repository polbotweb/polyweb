/**
 * Aperçu sécurisé générique des brouillons (core/preview) — Effect natif.
 *
 * Jeton sans état : `<payload base64url>.<HMAC-SHA256 base64url>` ;
 * payload = { k: type de ressource, i: identifiant, l: locale, x: expiration (s) }.
 *
 * - la clé HMAC est dérivée de POLYWEB_SIGNING_SECRET avec un préfixe de domaine propre
 *   (`polyweb:draft-preview:`) : les jetons d'aperçu de contenu (modules/content) ne sont
 *   pas acceptés ici, et inversement ;
 * - le type `k` est signé : un jeton « page » n'ouvre jamais un autre type de ressource ;
 * - durée de vie bornée (60 s – 30 jours) ; rotation du secret = révocation de tous les liens ;
 * - comparaison de signature à temps constant, taille du jeton bornée.
 *
 * Le chargement est délégué à un registre de résolveurs (un par type), fourni par
 * l'application (`src/lib/preview/resolvers.ts`) : core ne connaît aucun domaine.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { Clock, Effect, Schema } from "effect";
import { AppConfig } from "@/lib/effect/config";
import { NotFoundError, UnauthorizedError } from "@/lib/effect/errors";
import { decode } from "@/lib/effect/schema";

export const DraftPreviewClaims = Schema.Struct({
  k: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(40))),
  i: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(64))),
  l: Schema.String.pipe(Schema.check(Schema.isMaxLength(8))),
  x: Schema.Number.pipe(Schema.check(Schema.isInt())),
});
export type DraftPreviewClaims = typeof DraftPreviewClaims.Type;

export const DRAFT_PREVIEW_TTL_CHOICES = { "1h": 3600, "24h": 86_400, "7j": 604_800, "30j": 2_592_000 } as const;
export type DraftPreviewTtl = keyof typeof DRAFT_PREVIEW_TTL_CHOICES;
const MIN_TTL = 60;
const MAX_TTL = 2_592_000;
const MAX_TOKEN_LENGTH = 1024;

const mac = (secret: string, payload: string) =>
  createHmac("sha256", `polyweb:draft-preview:${secret}`).update(payload).digest("base64url");

/** Signe des claims (exposé pour les tests et outils). */
export function signDraftPreviewClaims(secret: string, claims: DraftPreviewClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${mac(secret, payload)}`;
}

export const createDraftPreviewToken = (input: { kind: string; id: string; locale: string; ttlSeconds: number }) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const now = Math.floor((yield* Clock.currentTimeMillis) / 1000);
    const claims: DraftPreviewClaims = {
      k: input.kind,
      i: input.id,
      l: input.locale,
      x: now + Math.min(Math.max(MIN_TTL, Math.floor(input.ttlSeconds)), MAX_TTL),
    };
    return { token: signDraftPreviewClaims(config.signingSecret, claims), claims };
  });

const invalid = (reason: string) => new UnauthorizedError({ reason });

/** Vérifie signature, forme et expiration ; `expectedKind` restreint le type accepté. */
export const verifyDraftPreviewToken = (token: string, expectedKind?: string) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    if (token.length > MAX_TOKEN_LENGTH) return yield* invalid("Malformed preview token");
    const [payload, sig, extra] = token.split(".");
    if (!payload || !sig || extra !== undefined) return yield* invalid("Malformed preview token");
    const expected = Buffer.from(mac(config.signingSecret, payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return yield* invalid("Bad preview signature");
    const raw = yield* Effect.try({ try: () => JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown, catch: () => invalid("Malformed preview payload") });
    const claims = yield* decode(DraftPreviewClaims)(raw).pipe(Effect.mapError(() => invalid("Malformed preview payload")));
    const now = Math.floor((yield* Clock.currentTimeMillis) / 1000);
    if (claims.x <= now) return yield* invalid("Preview link expired");
    if (expectedKind !== undefined && claims.k !== expectedKind) return yield* invalid("Preview kind mismatch");
    return claims;
  });

/**
 * Résolveur d'aperçu d'un type de ressource : `load` lit l'état COURANT (brouillon compris)
 * et renvoie null si la ressource n'existe plus (ou est en corbeille) ; `permission` est
 * exigée pour créer un lien.
 */
export interface DraftPreviewResolver<A, E = never, R = never> {
  readonly kind: string;
  readonly permission: Record<string, string[]>;
  readonly load: (id: string, locale: string) => Effect.Effect<A | null, E, R>;
}

export interface DraftPreview<A> {
  readonly kind: string;
  readonly data: A;
  readonly claims: DraftPreviewClaims;
  readonly expiresAt: Date;
}

/** Vérifie le jeton puis charge la ressource via le résolveur de son type. */
export const loadDraftPreview = <A, E, R>(token: string, resolvers: ReadonlyMap<string, DraftPreviewResolver<A, E, R>>) =>
  Effect.gen(function* () {
    const claims = yield* verifyDraftPreviewToken(token);
    const resolver = resolvers.get(claims.k);
    if (!resolver) return yield* invalid("Unknown preview kind");
    const data = yield* resolver.load(claims.i, claims.l);
    if (data === null) return yield* new NotFoundError({ entity: claims.k, id: claims.i });
    return { kind: claims.k, data, claims, expiresAt: new Date(claims.x * 1000) } satisfies DraftPreview<A>;
  }).pipe(Effect.withSpan("core.preview.load"));
