/**
 * Observation des requêtes (brique l), appelée par le middleware :
 * span serveur par requête (si OTLP actif) et remontée des exceptions de
 * rendu (si Sentry actif). Sans configuration : simple appel de `next()`.
 */
import type { APIContext, MiddlewareNext } from 'astro';
import { Effect } from 'effect';
import { appRuntime } from '@/lib/effect/runtime';
import { captureError, errorReporterFromEnv } from './errors';
import { telemetryEnabled } from './telemetry';

const active = telemetryEnabled() || errorReporterFromEnv(process.env).enabled;

export function observeRequest(context: APIContext, next: MiddlewareNext): Promise<Response> {
  if (!active || context.isPrerendered) return next();
  const route = context.routePattern || context.url.pathname;
  const program = Effect.tryPromise({ try: () => next(), catch: (e) => e }).pipe(
    Effect.tap((res) => Effect.annotateCurrentSpan('http.status_code', res.status)),
    Effect.tapError((e) =>
      captureError(e, { request: { method: context.request.method, url: context.request.url }, tags: { route, boundary: 'render' }, userId: context.locals.user?.id }),
    ),
    Effect.withSpan(`${context.request.method} ${route}`, { kind: 'server', attributes: { 'http.request.method': context.request.method, 'http.route': route, 'url.path': context.url.pathname } }),
  );
  return appRuntime.runPromise(program);
}
