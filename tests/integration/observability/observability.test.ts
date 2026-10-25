import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { buildSentryEnvelope, errorReporterFromEnv, makeSentryReporter, parseSentryDsn, parseStack } from '@/lib/observability/errors';
import { parseOtlpHeaders, telemetryLayer, telemetrySettingsFromEnv } from '@/lib/observability/telemetry';

interface Req { path: string; headers: Record<string, string | string[] | undefined>; body: string }
const received: Req[] = [];
let server: Server;
let base: string;
let status = 200;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ path: req.url ?? '', headers: req.headers, body });
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('Sentry reporter (brick l)', () => {
  it('parses DSNs and stacks', () => {
    expect(parseSentryDsn('https://abc@o1.ingest.sentry.io/42')).toEqual({ envelopeUrl: 'https://o1.ingest.sentry.io/api/42/envelope/', publicKey: 'abc', dsn: 'https://abc@o1.ingest.sentry.io/42' });
    expect(parseSentryDsn('https://k@host/sub/7')?.envelopeUrl).toBe('https://host/sub/api/7/envelope/');
    expect(parseSentryDsn('not a dsn')).toBeNull();
    expect(parseSentryDsn('https://host/1')).toBeNull();
    const frames = parseStack(new Error('x').stack);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.at(-1)!.filename).toContain('observability.test.ts');
    expect(errorReporterFromEnv({}).enabled).toBe(false);
  });

  it('builds an envelope without query strings and tags Effect errors', () => {
    const err = Object.assign(new Error('boom'), { _tag: 'DbError' });
    const { eventId, body } = buildSentryEnvelope(err, { request: { method: 'GET', url: 'https://site.test/api/x?token=secret' }, tags: { route: '/api/x' }, userId: 'u1' }, { dsn: 'https://k@h/1', environment: 'test', release: '1.2.3' });
    const [header, item, payload] = body.split('\n').map((l) => JSON.parse(l));
    expect(header.event_id).toBe(eventId);
    expect(item.type).toBe('event');
    expect(payload.request.url).toBe('https://site.test/api/x');
    expect(body).not.toContain('secret');
    expect(payload.exception.values[0]).toMatchObject({ type: 'DbError', value: 'boom' });
    expect(payload).toMatchObject({ environment: 'test', release: '1.2.3', user: { id: 'u1' }, tags: { route: '/api/x', effect_tag: 'DbError' } });
  });

  it('sends to the envelope endpoint, respects sampling, and never fails the caller', async () => {
    received.length = 0;
    const dsn = parseSentryDsn(`${base.replace('http://', 'http://pubkey@')}/5`)!;
    const reporter = makeSentryReporter({ dsn, environment: 'test', sampleRate: 1 });
    await Effect.runPromise(reporter.capture(new Error('kaput'), { tags: { a: 'b' } }));
    expect(received).toHaveLength(1);
    expect(received[0]!.path).toBe('/api/5/envelope/');
    expect(String(received[0]!.headers['x-sentry-auth'])).toContain('sentry_key=pubkey');
    expect(received[0]!.body).toContain('kaput');
    await Effect.runPromise(makeSentryReporter({ dsn, environment: 'test', sampleRate: 0 }).capture(new Error('skip')));
    expect(received).toHaveLength(1);
    status = 500;
    await expect(Effect.runPromise(reporter.capture(new Error('server down')))).resolves.toBeUndefined();
    status = 200;
    const unreachable = makeSentryReporter({ dsn: { ...dsn, envelopeUrl: 'http://127.0.0.1:1/api/5/envelope/' }, environment: 'test', sampleRate: 1, timeoutMs: 500 });
    await expect(Effect.runPromise(unreachable.capture(new Error('x')))).resolves.toBeUndefined();
  });
});

describe('OpenTelemetry OTLP export (brick l)', () => {
  it('reads settings from env', () => {
    expect(telemetrySettingsFromEnv({})).toBeNull();
    expect(telemetrySettingsFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://x:4318', OTEL_SDK_DISABLED: 'true' })).toBeNull();
    expect(telemetrySettingsFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://x:4318/', OTEL_SERVICE_NAME: 'svc' })).toMatchObject({ endpoint: 'http://x:4318', serviceName: 'svc' });
    expect(parseOtlpHeaders('a=1, b = x%20y,bad')).toEqual({ a: '1', b: 'x y' });
  });

  it('exports Effect spans to /v1/traces with resource attributes', async () => {
    received.length = 0;
    const layer = telemetryLayer({ endpoint: base, headers: { 'x-api-key': 'k' }, serviceName: 'polyweb-test', release: '9.9.9', environment: 'test' });
    const rt = ManagedRuntime.make(layer as Layer.Layer<never>);
    await rt.runPromise(Effect.sleep('5 millis').pipe(Effect.withSpan('child.op'), Effect.withSpan('parent.op', { attributes: { foo: 'bar' } })));
    await rt.dispose(); // flush à l'arrêt
    const traces = received.filter((r) => r.path === '/v1/traces');
    expect(traces.length).toBeGreaterThan(0);
    const all = traces.map((t) => t.body).join('\n');
    expect(all).toContain('parent.op');
    expect(all).toContain('child.op');
    expect(all).toContain('polyweb-test');
    expect(traces[0]!.headers['x-api-key']).toBe('k');
  });
});
