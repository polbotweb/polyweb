/**
 * Jetons d'API (brique c) — Effect natif.
 *
 * Format : `pw_<prefix 8>_<secret 43>` (secret = 32 octets base64url).
 * Seul le SHA-256 hex est stocké ; le jeton en clair n'est renvoyé qu'à la création.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Clock, Effect, Schema } from 'effect';
import { schema } from '@database/drizzle';
import { API_SCOPES, type ApiScope } from '@database/schemas/api.schema';
import { query } from '@/lib/effect/db';
import { ForbiddenError, NotFoundError, UnauthorizedError, RateLimitedError } from '@/lib/effect/errors';
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
  scopes: Schema.Array(Schema.Literals(API_SCOPES)).pipe(Schema.check(Schema.isMinLength(1))),
  /** Durée de validité en jours (absent = sans expiration). */
  expiresInDays: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 3650 })))),
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
    return { kind: 'token', tokenId: row.id, siteId: row.siteId, scopes: new Set(row.scopes) } satisfies ApiPrincipal as ApiPrincipal;
  }).pipe(Effect.withSpan('api.authenticate'));

export const API_RATE_LIMITS = {
  token: { window: 60, max: Number(process.env.API_RATE_LIMIT_TOKEN ?? 600) },
  anonymous: { window: 60, max: Number(process.env.API_RATE_LIMIT_ANON ?? 120) },
} as const;

export const rateLimit = (principal: ApiPrincipal, clientIp: string) =>
  Effect.suspend(() => {
    const key = principal.tokenId ? `api:token:${principal.tokenId}` : `api:ip:${clientIp}`;
    const r = checkRateLimit(key, principal.tokenId ? API_RATE_LIMITS.token : API_RATE_LIMITS.anonymous);
    return r.allowed
      ? Effect.succeed(r)
      : Effect.fail(new RateLimitedError({ retryAfterSeconds: Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000)) }));
  });
