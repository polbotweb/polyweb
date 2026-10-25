/**
 * OpenTelemetry (brique l) — exporteur OTLP/HTTP JSON natif d'Effect
 * (traces, métriques, logs), sans SDK OpenTelemetry.
 *
 *   OTEL_EXPORTER_OTLP_ENDPOINT   ex. http://localhost:4318 (désactivé si vide)
 *   OTEL_EXPORTER_OTLP_HEADERS    ex. "x-honeycomb-team=abc,foo=bar"
 *   OTEL_SERVICE_NAME             défaut « polyweb »
 *   POLYWEB_RELEASE               version déployée (sinon npm_package_version)
 *
 * Tous les `Effect.withSpan(...)` du code (db.query, webhooks, search, forms,
 * plugins…) deviennent des spans exportés.
 */
import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { Otlp } from 'effect/observability';

export function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (raw ?? '').split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export interface TelemetrySettings {
  readonly endpoint: string;
  readonly headers: Record<string, string>;
  readonly serviceName: string;
  readonly release: string | undefined;
  readonly environment: string;
}

export function telemetrySettingsFromEnv(env: Readonly<Record<string, string | undefined>>): TelemetrySettings | null {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint || env.OTEL_SDK_DISABLED === 'true') return null;
  return {
    endpoint: endpoint.replace(/\/$/, ''),
    headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    serviceName: env.OTEL_SERVICE_NAME?.trim() || 'polyweb',
    release: env.POLYWEB_RELEASE?.trim() || env.npm_package_version,
    environment: env.NODE_ENV ?? 'development',
  };
}

export const telemetryLayer = (settings: TelemetrySettings | null) =>
  settings
    ? Otlp.layerJson({
        baseUrl: settings.endpoint,
        headers: settings.headers,
        resource: { serviceName: settings.serviceName, serviceVersion: settings.release, attributes: { 'deployment.environment': settings.environment } },
        tracerExportInterval: '2 seconds',
        shutdownTimeout: '3 seconds',
      }).pipe(Layer.provide(FetchHttpClient.layer))
    : Layer.empty;

export const TelemetryLive = telemetryLayer(telemetrySettingsFromEnv(process.env));
export const telemetryEnabled = () => telemetrySettingsFromEnv(process.env) !== null;
