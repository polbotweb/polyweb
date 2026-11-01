/**
 * Jetons d'API (brique c) — Effect natif.
 *
 * Format : `pw_<prefix 8>_<secret 43>` (secret = 32 octets base64url).
 * Seul le SHA-256 hex est stocké ; le jeton en clair n'est renvoyé qu'à la création.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { Clock, Effect, Schema } from 'effect';
import { schema } from '@database/drizzle';
import type { ApiScope } from '@database/schemas/api.schema';
import { listApiScopes } from '@/core/api/registry';
import { type Db, query } from '@/lib/effect/db';
import { type DbError, ForbiddenError, NotFoundError, UnauthorizedError, RateLimitedError } from '@/lib/effect/errors';
import { decode } from '@/lib/effect/schema';
import { checkRateLimit } from '@/lib/rate-limit';

export type ApiToken = typeof schema.apiTokens.$inferSelect;
export type PublicApiToken = Omit<ApiToken, 'tokenHash'>;

export const TOKEN_PATTERN = /^pw_([A-Za-z0-9]{8})_([A-Za-z0-9_-]{43})$/;

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export function generateToken(): { token: string; prefix: string; hash: string } {
  const prefix = randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8);
  const token = `pw_${prefix}_${randomBytes(32).toString('base64url')}`;
  return { token, prefix, hash: hashToken(token) };
}

const strip = ({ tokenHash: _hash, ...rest }: ApiToken): PublicApiToken => rest;

export const CreateTokenInput = Schema.Struct({
  name: Schema.Trim.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(120))),
  /** Scopes connus : cœur + scopes déclarés par les ressources des modules (registre). */
  scopes: Schema.Array(Schema.String.pipe(Schema.check(Schema.makeFilter((s: string) => listApiScopes().includes(s) || 'Unknown scope')))).pipe(
    Schema.check(Schema.isMinLength(1)),
  ),
  /** Durée de validité en jours (absent = sans expiration). */
  expiresInDays: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 3650 })))),
  /** Quota par minute propre à la clé (absent = valeur par défaut). */
  rateLimitPerMinute: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 100_000 })))),
});
export type CreateTokenInput = typeof CreateTokenInput.Type;

export const createToken = (siteId: string, input: unknown, createdBy: string | null) =>
  Effect.gen(function* () {
    const data = yield* decode(CreateTokenInput)(input);
    const now = yield* Clock.currentTimeMillis;
    const { token, prefix, hash } = generateToken();
    const [row] = yield* query('apiTokens.create', (db) =>
      db
        .insert(schema.apiTokens)
        .values({
          siteId,
          name: data.name,
          prefix,
          tokenHash: hash,
          scopes: [...new Set(data.scopes)],
          createdBy,
          expiresAt: data.expiresInDays ? new Date(now + data.expiresInDays * 86_400_000) : null,
          rateLimitPerMinute: data.rateLimitPerMinute ?? null,
        })
        .returning(),
    );
    return { token, record: strip(row!) };
  }).pipe(Effect.withSpan('apiTokens.create'));

export const listTokens = (siteId: string) =>
  query('apiTokens.list', (db) =>
    db.select().from(schema.apiTokens).where(eq(schema.apiTokens.siteId, siteId)).orderBy(desc(schema.apiTokens.createdAt)),
  ).pipe(Effect.map((rows) => rows.map(strip)));

export const revokeToken = (siteId: string, id: string) =>
  Effect.gen(function* () {
    const rows = yield* query('apiTokens.revoke', (db) =>
      db
        .update(schema.apiTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.siteId, siteId), isNull(schema.apiTokens.revokedAt)))
        .returning({ id: schema.apiTokens.id }),
    );
    if (rows.length === 0) return yield* new NotFoundError({ entity: 'ApiToken', id });
  });

export interface ApiPrincipal {
  readonly kind: 'token' | 'anonymous';
  readonly tokenId: string | null;
  readonly siteId: string;
  readonly scopes: ReadonlySet<ApiScope>;
  /** Quota par minute propre à la clé (`null` = défaut). */
  readonly rateLimitPerMinute?: number | null;
}

export const hasScope = (p: ApiPrincipal, scope: ApiScope) => p.scopes.has(scope);

export const requireScope = (p: ApiPrincipal, scope: ApiScope): Effect.Effect<void, UnauthorizedError | ForbiddenError> =>
  p.kind === 'anonymous'
    ? Effect.fail(new UnauthorizedError({ reason: `API token with scope ${scope} required` }))
    : p.scopes.has(scope)
      ? Effect.void
      : Effect.fail(new ForbiddenError({ reason: `Missing scope ${scope}` }));

/** Ne met à jour `last_used_at` qu'au plus une fois par minute et par jeton. */
const LAST_USED_THROTTLE_MS = 60_000;

/**
 * Authentifie une requête. Sans en-tête Authorization → principal anonyme
 * sur le site résolu par l'hôte (lecture publique seulement).
 */
export const authenticate = (authorization: string | null, fallbackSiteId: string) =>
  Effect.gen(function* () {
    if (!authorization) {
      return { kind: 'anonymous', tokenId: null, siteId: fallbackSiteId, scopes: new Set() } satisfies ApiPrincipal as ApiPrincipal;
    }
    const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
    const token = match?.[1];
    if (!token || !TOKEN_PATTERN.test(token)) return yield* new UnauthorizedError({ reason: 'Malformed bearer token' });
    const [row] = yield* query('apiTokens.lookup', (db) =>
      db.select().from(schema.apiTokens).where(eq(schema.apiTokens.tokenHash, hashToken(token))).limit(1),
    );
    const now = yield* Clock.currentTimeMillis;
    if (!row || row.revokedAt) return yield* new UnauthorizedError({ reason: 'Invalid or revoked token' });
    if (row.expiresAt && row.expiresAt.getTime() <= now) return yield* new UnauthorizedError({ reason: 'Token expired' });
    if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
      // Non bloquant pour la requête : une erreur ici est journalisée puis ignorée.
      yield* query('apiTokens.touch', (db) =>
        db.update(schema.apiTokens).set({ lastUsedAt: new Date(now) }).where(eq(schema.apiTokens.id, row.id)),
      ).pipe(Effect.tapError((e) => Effect.logWarning('api token touch failed', e)), Effect.ignore);
    }
    return { kind: 'token', tokenId: row.id, siteId: row.siteId, scopes: new Set(row.scopes), rateLimitPerMinute: row.rateLimitPerMinute } satisfies ApiPrincipal as ApiPrincipal;
  }).pipe(Effect.withSpan('api.authenticate'));

export const API_RATE_LIMITS = {
  token: { window: 60, max: Number(process.env.API_RATE_LIMIT_TOKEN ?? 600) },
  anonymous: { window: 60, max: Number(process.env.API_RATE_LIMIT_ANON ?? 120) },
} as const;

export interface RateLimitState {
  readonly limit: number;
  readonly remaining: number;
  /** Secondes avant la réinitialisation de la fenêtre. */
  readonly reset: number;
}

/** En-têtes `RateLimit-*` (draft IETF) pour une réponse réussie. */
export const rateLimitHeaders = (s: RateLimitState): Record<string, string> => ({
  'ratelimit-limit': String(s.limit),
  'ratelimit-remaining': String(s.remaining),
  'ratelimit-reset': String(s.reset),
});

/**
 * Fenêtre fixe d'une minute par clé, en base (partagée entre instances) :
 * upsert atomique qui renvoie le compteur. Les anciennes fenêtres sont purgées
 * au passage (au plus 1 requête sur 100).
 */
export const tokenRateLimit = (tokenId: string, max: number) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const windowStart = new Date(Math.floor(now / 60_000) * 60_000);
    const reset = Math.max(1, Math.ceil((windowStart.getTime() + 60_000 - now) / 1000));
    const [row] = yield* query('api.rateLimit', (db) =>
      db
        .insert(schema.apiRateWindows)
        .values({ tokenId, windowStart, count: 1 })
        .onConflictDoUpdate({
          target: [schema.apiRateWindows.tokenId, schema.apiRateWindows.windowStart],
          set: { count: sql`${schema.apiRateWindows.count} + 1` },
        })
        .returning({ count: schema.apiRateWindows.count }),
    );
    if (Math.random() < 0.01) {
      yield* query('api.rateLimit.gc', (db) => db.delete(schema.apiRateWindows).where(lt(schema.apiRateWindows.windowStart, new Date(now - 3_600_000)))).pipe(Effect.ignore);
    }
    const count = row?.count ?? 1;
    if (count > max) return yield* new RateLimitedError({ retryAfterSeconds: reset, limit: max });
    return { limit: max, remaining: Math.max(0, max - count), reset } satisfies RateLimitState as RateLimitState;
  }).pipe(Effect.withSpan('api.rateLimit'));

export const rateLimit = (principal: ApiPrincipal, clientIp: string): Effect.Effect<RateLimitState, RateLimitedError | DbError, Db> => {
  if (principal.tokenId) return tokenRateLimit(principal.tokenId, principal.rateLimitPerMinute ?? API_RATE_LIMITS.token.max);
  return Effect.suspend(() => {
    const cfg = API_RATE_LIMITS.anonymous;
    const r = checkRateLimit(`api:ip:${clientIp}`, cfg);
    const reset = Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000));
    return r.allowed
      ? Effect.succeed({ limit: cfg.max, remaining: r.remaining, reset } satisfies RateLimitState as RateLimitState)
      : Effect.fail(new RateLimitedError({ retryAfterSeconds: reset, limit: cfg.max }));
  });
};
