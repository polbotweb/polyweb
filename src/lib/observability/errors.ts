/**
 * Remontée d'erreurs (brique l) — service Effect `ErrorReporter`.
 *
 *   SENTRY_DSN          https://<clé>@<hôte>/<projet> (désactivé si vide)
 *   SENTRY_ENVIRONMENT  défaut NODE_ENV
 *   SENTRY_SAMPLE_RATE  0..1, défaut 1
 *
 * Implémentation sans SDK : envoi d'une « envelope » Sentry par fetch
 * (compatible Sentry, GlitchTip, Bugsink…). Aucune donnée sensible : ni
 * en-têtes, ni cookies, ni corps de requête ; seulement méthode, chemin,
 * type/message/pile de l'erreur et étiquettes fournies.
 * Ne fait JAMAIS échouer l'appelant (délai 3 s, erreurs avalées).
 */
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { Context, Effect, Layer } from 'effect';

export interface ErrorContext {
  readonly request?: { readonly method: string; readonly url: string };
  readonly tags?: Record<string, string>;
  readonly userId?: string | null;
  readonly level?: 'fatal' | 'error' | 'warning';
}

export interface ErrorReporterShape {
  readonly enabled: boolean;
  readonly capture: (error: unknown, context?: ErrorContext) => Effect.Effect<void>;
}

export class ErrorReporter extends Context.Service<ErrorReporter, ErrorReporterShape>()('polyweb/ErrorReporter') {}

export interface SentryDsn {
  readonly envelopeUrl: string;
  readonly publicKey: string;
  readonly dsn: string;
}

export function parseSentryDsn(dsn: string | undefined): SentryDsn | null {
  if (!dsn?.trim()) return null;
  try {
    const u = new URL(dsn.trim());
    const projectId = u.pathname.split('/').filter(Boolean).pop();
    if (!u.username || !projectId || !/^\d+$/.test(projectId)) return null;
    const prefix = u.pathname.split('/').filter(Boolean).slice(0, -1).join('/');
    return { envelopeUrl: `${u.protocol}//${u.host}/${prefix ? `${prefix}/` : ''}api/${projectId}/envelope/`, publicKey: u.username, dsn: dsn.trim() };
  } catch {
    return null;
  }
}

const FRAME = /^\s*at (?:(.+?) \()?(.*?):(\d+):(\d+)\)?$/;
export function parseStack(stack: string | undefined) {
  return (stack ?? '')
    .split('\n')
    .slice(1, 51)
    .map((line) => FRAME.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ function: m[1] ?? '<anonymous>', filename: m[2], lineno: Number(m[3]), colno: Number(m[4]), in_app: !m[2]!.includes('node_modules') && !m[2]!.startsWith('node:') }))
    .reverse(); // Sentry : plus ancien en premier
}

/** URL sans query string (peut contenir des jetons). */
const safeUrl = (raw: string) => {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return raw.split('?')[0]!;
  }
};

export function buildSentryEnvelope(error: unknown, ctx: ErrorContext, meta: { dsn: string; environment: string; release?: string }): { eventId: string; body: string } {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error)?.slice(0, 500) ?? 'Unknown error');
  const eventId = randomUUID().replace(/-/g, '');
  const now = new Date();
  const tag = (error as { _tag?: unknown })?._tag;
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: 'node',
    level: ctx.level ?? 'error',
    environment: meta.environment,
    ...(meta.release ? { release: meta.release } : {}),
    server_name: hostname(),
    tags: { ...(typeof tag === 'string' ? { effect_tag: tag } : {}), ...ctx.tags },
    ...(ctx.userId ? { user: { id: ctx.userId } } : {}),
    ...(ctx.request ? { request: { method: ctx.request.method, url: safeUrl(ctx.request.url) } } : {}),
    exception: { values: [{ type: typeof tag === 'string' ? tag : err.name, value: err.message.slice(0, 2000), stacktrace: { frames: parseStack(err.stack) } }] },
  };
  const body = [JSON.stringify({ event_id: eventId, sent_at: now.toISOString(), dsn: meta.dsn }), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n');
  return { eventId, body };
}

export function makeSentryReporter(settings: { dsn: SentryDsn; environment: string; release?: string; sampleRate: number; timeoutMs?: number }): ErrorReporterShape {
  return {
    enabled: true,
    capture: (error, ctx = {}) =>
      Effect.gen(function* () {
        if (settings.sampleRate < 1 && Math.random() >= settings.sampleRate) return;
        const { body } = buildSentryEnvelope(error, ctx, { dsn: settings.dsn.dsn, environment: settings.environment, release: settings.release });
        yield* Effect.tryPromise({
          try: (signal) =>
            fetch(settings.dsn.envelopeUrl, {
              method: 'POST',
              signal: AbortSignal.any([signal, AbortSignal.timeout(settings.timeoutMs ?? 3000)]),
              headers: {
                'content-type': 'application/x-sentry-envelope',
                'x-sentry-auth': `Sentry sentry_version=7, sentry_client=polyweb/1.0, sentry_key=${settings.dsn.publicKey}`,
              },
              body,
            }).then((r) => {
              if (!r.ok && r.status !== 429) throw new Error(`Sentry HTTP ${r.status}`);
            }),
          catch: (cause) => cause,
        });
      }).pipe(
        Effect.catchCause((cause) => Effect.logWarning('[sentry] envoi impossible', cause)),
        Effect.withSpan('sentry.capture'),
      ),
  };
}

export const noopReporter: ErrorReporterShape = { enabled: false, capture: () => Effect.void };

export function errorReporterFromEnv(env: Readonly<Record<string, string | undefined>>): ErrorReporterShape {
  const dsn = parseSentryDsn(env.SENTRY_DSN);
  if (!dsn) return noopReporter;
  const rate = Number(env.SENTRY_SAMPLE_RATE ?? 1);
  return makeSentryReporter({
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV || 'development',
    release: env.POLYWEB_RELEASE?.trim() || env.npm_package_version,
    sampleRate: Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 1) : 1,
  });
}

export const ErrorReporterLive = Layer.sync(ErrorReporter, () => errorReporterFromEnv(process.env));

/** Façade pour le code non-Effect (middleware, scripts). Ne lève jamais. */
export const captureError = (error: unknown, context?: ErrorContext) => ErrorReporter.use((r) => r.capture(error, context));
