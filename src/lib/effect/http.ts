/**
 * Thin adapters between Astro (APIRoute / page frontmatter / middleware) and
 * Effect programs. Business logic never lives here — only:
 *   1. run the program on the shared `appRuntime`,
 *   2. map typed failures to HTTP responses.
 */
import type { APIContext, APIRoute } from 'astro';
import { Cause, Effect, Exit } from 'effect';
import { appRuntime, type AppServices } from './runtime';
import type { AppError } from './errors';

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

const STATUS: Record<AppError['_tag'], number> = {
  ValidationError: 400,
  UnauthorizedError: 401,
  ForbiddenError: 403,
  NotFoundError: 404,
  ConflictError: 409,
  RateLimitedError: 429,
  UpstreamError: 502,
  DbError: 500,
  ConfigError: 500,
};

/** Map a typed failure to a JSON problem response. Unknown errors → 500. */
export function errorResponse(error: unknown): Response {
  const tag = (error as { _tag?: string } | null)?._tag as AppError['_tag'] | undefined;
  if (tag && tag in STATUS) {
    const e = error as AppError;
    const status = STATUS[tag];
    const body: Record<string, unknown> = {
      error: tag,
      // Never leak DB/config internals to clients.
      message: status >= 500 ? 'Internal error' : e.message,
    };
    if (e._tag === 'ValidationError') body.issues = e.issues;
    const headers: Record<string, string> = {};
    if (e._tag === 'RateLimitedError') headers['retry-after'] = String(e.retryAfterSeconds);
    if (e._tag === 'UnauthorizedError') headers['www-authenticate'] = 'Bearer';
    return json(body, { status, headers });
  }
  return json({ error: 'InternalError', message: 'Internal error' }, { status: 500 });
}

/** Run an Effect on the shared runtime and return a plain Promise. */
export const runApp = <A, E>(effect: Effect.Effect<A, E, AppServices>): Promise<A> => appRuntime.runPromise(effect);

export type RunResult<A, E> = { ok: true; value: A } | { ok: false; error: E };

/**
 * For page frontmatter: run and get a discriminated result (typed failures
 * are returned, defects are re-thrown so Astro shows its error page).
 */
export async function runAppResult<A, E>(effect: Effect.Effect<A, E, AppServices>): Promise<RunResult<A, E>> {
  const exit = await appRuntime.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return { ok: true, value: exit.value };
  const failure = Cause.findErrorOption(exit.cause);
  if (failure._tag === 'Some') return { ok: false, error: failure.value };
  throw Cause.squash(exit.cause);
}

/**
 * Wrap an Effect handler as an Astro APIRoute. Typed failures become JSON
 * problem responses; defects are logged and become a 500.
 */
export function apiRoute<E>(
  handler: (context: APIContext) => Effect.Effect<Response, E, AppServices>,
): APIRoute {
  return async (context) => {
    const program = handler(context).pipe(
      Effect.catchCause((cause) => {
        const failure = Cause.findErrorOption(cause);
        if (failure._tag === 'Some') return Effect.succeed(errorResponse(failure.value));
        return Effect.logError('Unhandled defect in API route', context.url.pathname, cause).pipe(
          Effect.as(errorResponse(null)),
        );
      }),
      Effect.withSpan(`http ${context.request.method} ${context.url.pathname}`),
    );
    return appRuntime.runPromise(program as Effect.Effect<Response, never, AppServices>);
  };
}
