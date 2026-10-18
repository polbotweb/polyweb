/**
 * Service `WebhookHttp` : envoi HTTP POST avec garde SSRF au niveau socket,
 * timeout et sans suivi de redirection. Remplaçable en test par une Layer.
 */
import { Agent, fetch as undiciFetch } from 'undici';
import { Context, Duration, Effect, Layer } from 'effect';
import { AppConfig } from '@/lib/effect/config';
import { UpstreamError } from '@/lib/effect/errors';
import { guardedLookup, SsrfBlockedError } from './ssrf';

export interface WebhookResponse {
  readonly status: number;
  readonly body: string;
  readonly durationMs: number;
}

export interface WebhookHttpShape {
  readonly post: (url: string, body: string, headers: Record<string, string>) => Effect.Effect<WebhookResponse, UpstreamError>;
}

export class WebhookHttp extends Context.Service<WebhookHttp, WebhookHttpShape>()('polyweb/WebhookHttp') {}

const MAX_BODY = 1000;

export const WebhookHttpLive = Layer.effect(
  WebhookHttp,
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const { allowPrivateUrls, timeoutMs } = config.webhooks;
    const agent = new Agent({ connect: { lookup: guardedLookup(allowPrivateUrls) as never, timeout: timeoutMs } });
    yield* Effect.addFinalizer(() => Effect.promise(() => agent.close()));
    return {
      post: (url, body, headers) =>
        Effect.gen(function* () {
          const started = Date.now();
          const res = yield* Effect.tryPromise({
            try: (signal) => undiciFetch(url, { method: 'POST', body, headers, redirect: 'manual', dispatcher: agent, signal }),
            catch: (cause) => {
              const root = (cause as { cause?: unknown })?.cause ?? cause;
              return new UpstreamError({
                service: 'webhook',
                cause: root instanceof SsrfBlockedError ? root.message : root instanceof Error ? root.message : String(root),
              });
            },
          });
          const text = yield* Effect.promise(() => res.text().catch(() => ''));
          return { status: res.status, body: text.slice(0, MAX_BODY), durationMs: Date.now() - started };
        }).pipe(
          Effect.timeoutOrElse({
            duration: Duration.millis(timeoutMs),
            orElse: () => Effect.fail(new UpstreamError({ service: 'webhook', cause: `timeout after ${timeoutMs}ms` })),
          }),
          Effect.withSpan('webhook.http.post', { attributes: { 'url.full': url } }),
        ),
    };
  }),
);
