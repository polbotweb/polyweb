/**
 * Contexte de requête du middleware, en Effect :
 *  - session better-auth bornée par un timeout (→ 503 côté middleware) ;
 *    une erreur de session est journalisée et traitée comme « anonyme » ;
 *  - site courant d'après le Host (cache 30 s) ; une erreur donne `null`.
 * Le middleware Astro (`src/middleware.ts`) n'est qu'un adaptateur.
 */
import { Duration, Effect } from 'effect';
import { resolveSiteForHostEffect, type Site } from '@/modules/sites/domain/sites';

export type SessionOutcome<S> = { readonly _tag: 'Resolved'; readonly session: S | null } | { readonly _tag: 'TimedOut' };

export const SESSION_TIMEOUT = Duration.seconds(5);

export const resolveSession = <S>(getSession: () => Promise<S | null>, timeout: Duration.Input = SESSION_TIMEOUT): Effect.Effect<SessionOutcome<S>> =>
  Effect.tryPromise(getSession).pipe(
    Effect.map((session): SessionOutcome<S> => ({ _tag: 'Resolved', session: session ?? null })),
    Effect.catch((error) => Effect.logError('[middleware] Session check failed', error).pipe(Effect.as<SessionOutcome<S>>({ _tag: 'Resolved', session: null }))),
    // La requête better-auth ne peut pas être annulée : elle se termine en arrière-plan
    // (bornée par le statement_timeout du pool) ; son rejet éventuel est absorbé par tryPromise.
    Effect.timeoutOrElse({
      duration: timeout,
      orElse: () => Effect.logWarning('[middleware] Session check timed out — returning 503').pipe(Effect.as<SessionOutcome<S>>({ _tag: 'TimedOut' })),
    }),
  );

/** Hôte effectif : `X-Forwarded-Host` seulement derrière un proxy de confiance. */
export function requestHost(headers: Headers, trustProxy: boolean): string | null {
  const forwarded = headers.get('x-forwarded-host');
  return forwarded && trustProxy ? forwarded : headers.get('host');
}

export const resolveSite = (host: string | null): Effect.Effect<Site | null> =>
  resolveSiteForHostEffect(host).pipe(Effect.catch((error) => Effect.logError('[middleware] Site resolution failed', error).pipe(Effect.as(null))));

export const serviceUnavailable = () =>
  new Response(JSON.stringify({ error: 'Service temporarily unavailable' }), {
    status: 503,
    headers: { 'Retry-After': '5', 'Content-Type': 'application/json' },
  });
