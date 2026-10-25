# Observabilité (brique l)

## Traces / métriques / logs — OpenTelemetry

Exporteur OTLP/HTTP JSON **natif d'Effect** (`effect/observability`), sans SDK OpenTelemetry.
Activé dès que `OTEL_EXPORTER_OTLP_ENDPOINT` est défini (ex. `http://localhost:4318`,
collecteur OTel, Jaeger, Grafana Tempo, Honeycomb…).

| Variable | Rôle |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | URL de base OTLP/HTTP (désactivé si vide) |
| `OTEL_EXPORTER_OTLP_HEADERS` | `clé=valeur,clé2=valeur2` (authentification) |
| `OTEL_SERVICE_NAME` | défaut `polyweb` |
| `OTEL_SDK_DISABLED=true` | coupe l'export |
| `POLYWEB_RELEASE` | version (sinon `npm_package_version`) |

Spans produits : une span serveur par requête (`GET /[lang]/f/[slug]`, motif de route — pas
d'URL brute), `http …` pour chaque `apiRoute`, et tous les `Effect.withSpan` du code (`db.*`,
`webhook.*`, `search.*`, `forms.submit`, `plugin.*`, `mail.send`…). Les logs Effect
(`Effect.log*`) partent aussi en OTLP.

## Erreurs — Sentry (ou compatible)

`SENTRY_DSN` active le service `ErrorReporter` (envoi d'« envelopes » par fetch, compatible
Sentry / GlitchTip / Bugsink, sans SDK). `SENTRY_ENVIRONMENT`, `SENTRY_SAMPLE_RATE` (0..1).

Remontés : défauts (exceptions inattendues) et erreurs typées 5xx des `apiRoute`, défauts des
pages (`runAppResult`), exceptions de rendu (middleware). Jamais envoyés : en-têtes, cookies,
corps, query string. L'envoi a un délai de 3 s et n'échoue jamais pour l'appelant.

Dans du code Effect : `yield* captureError(err, { tags: { … } })`.

## Limites

- Pas de propagation de contexte de trace entrante (`traceparent`) ni sortante (webhooks).
- Pas de source maps envoyées à Sentry ; pas de breadcrumbs ni de suivi des performances côté Sentry.
