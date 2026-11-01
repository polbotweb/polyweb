/**
 * En-tête `Idempotency-Key` pour les écritures de l'API publique.
 *
 * - 1re requête : la clé est réservée (statut `null` = en cours), l'écriture
 *   s'exécute, la réponse (statut + corps + Location) est enregistrée.
 * - Même clé + même requête (méthode, chemin, corps) : la réponse enregistrée
 *   est rejouée telle quelle (`Idempotent-Replayed: true`), pendant 24 h.
 * - Même clé + requête différente : 422. Requête encore en cours : 409.
 * - En cas d'échec de l'écriture, la réservation est libérée (on peut réessayer).
 */
import { createHash } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { Effect } from "effect";
import { schema } from "@database/drizzle";
import { query } from "@/lib/effect/db";
import { ConflictError, ValidationError } from "@/lib/effect/errors";

export const IDEMPOTENCY_TTL_MS = 24 * 3_600_000;
const KEY = /^[\x21-\x7e]{1,255}$/;

export interface StoredResponse {
  readonly status: number;
  readonly body: unknown;
  readonly location: string | null;
  readonly replayed: boolean;
}

export const requestFingerprint = (method: string, path: string, body: string): string =>
  createHash("sha256").update(`${method.toUpperCase()}\n${path}\n${body}`).digest("hex");

/**
 * Exécute `run` au plus une fois par (clé d'API, Idempotency-Key). Sans clé
 * (`key` null), exécute simplement `run`.
 */
export const withIdempotency = <E, R>(
  tokenId: string,
  key: string | null,
  fingerprint: string,
  run: Effect.Effect<{ status: number; body: unknown; location: string | null }, E, R>,
) =>
  Effect.gen(function* () {
    if (key === null) return { ...(yield* run), replayed: false } satisfies StoredResponse as StoredResponse;
    if (!KEY.test(key)) return yield* new ValidationError({ issues: [{ path: "Idempotency-Key", message: "1 to 255 visible ASCII characters" }] });
    const now = Date.now();
    // Purge de la clé expirée éventuelle, puis réservation atomique.
    yield* query("api.idem.expire", (db) =>
      db
        .delete(schema.apiIdempotencyKeys)
        .where(and(eq(schema.apiIdempotencyKeys.tokenId, tokenId), eq(schema.apiIdempotencyKeys.key, key), lt(schema.apiIdempotencyKeys.createdAt, new Date(now - IDEMPOTENCY_TTL_MS)))),
    );
    const reserved = yield* query("api.idem.reserve", (db) =>
      db
        .insert(schema.apiIdempotencyKeys)
        .values({ tokenId, key, requestHash: fingerprint })
        .onConflictDoNothing()
        .returning({ key: schema.apiIdempotencyKeys.key }),
    );
    if (reserved.length === 0) {
      const [existing] = yield* query("api.idem.lookup", (db) =>
        db
          .select()
          .from(schema.apiIdempotencyKeys)
          .where(and(eq(schema.apiIdempotencyKeys.tokenId, tokenId), eq(schema.apiIdempotencyKeys.key, key)))
          .limit(1),
      );
      if (!existing) return yield* new ConflictError({ reason: "Idempotency-Key is being processed" });
      if (existing.requestHash !== fingerprint) {
        return yield* new ValidationError({ issues: [{ path: "Idempotency-Key", message: "Key already used with a different request" }] });
      }
      if (existing.status === null) return yield* new ConflictError({ reason: "A request with this Idempotency-Key is in progress" });
      return { status: existing.status, body: existing.body, location: existing.location, replayed: true } satisfies StoredResponse as StoredResponse;
    }
    const release = query("api.idem.release", (db) =>
      db.delete(schema.apiIdempotencyKeys).where(and(eq(schema.apiIdempotencyKeys.tokenId, tokenId), eq(schema.apiIdempotencyKeys.key, key))),
    ).pipe(Effect.ignore);
    const result = yield* run.pipe(Effect.onError(() => release));
    yield* query("api.idem.store", (db) =>
      db
        .update(schema.apiIdempotencyKeys)
        .set({ status: result.status, body: result.body, location: result.location })
        .where(and(eq(schema.apiIdempotencyKeys.tokenId, tokenId), eq(schema.apiIdempotencyKeys.key, key))),
    );
    return { ...result, replayed: false } satisfies StoredResponse as StoredResponse;
  }).pipe(Effect.withSpan("api.idempotency"));
