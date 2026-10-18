/**
 * Aides pour les routes Astro migrées vers Effect en conservant leur contrat
 * HTTP historique (formes JSON, en-têtes) : réponses explicites, appels au
 * code Promise encapsulés (`attempt`), limitation de débit en Effect.
 */
import { Effect } from 'effect';
import { checkRateLimit, type RateLimitResult } from '@/lib/rate-limit';
import { OperationError } from './errors';

/** Réponse JSON historique (`Content-Type: application/json`). */
export function legacyJson(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

/** Encapsule un appel Promise : un rejet devient `OperationError` (→ 500 + Sentry via apiRoute). */
export const attempt = <A>(operation: string, f: () => Promise<A>) => Effect.tryPromise({ try: f, catch: (cause) => new OperationError({ operation, cause }) });

/** Limitation de débit (store mémoire/Redis existant) en Effect. */
export const rateLimit = (key: string, opts: { window: number; max: number }): Effect.Effect<RateLimitResult> => Effect.sync(() => checkRateLimit(key, opts));

export const retryAfterSeconds = (rl: RateLimitResult) => String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)));
