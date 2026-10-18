# Effect dans Polyweb — conventions

Polyweb utilise [Effect](https://effect.website) (`effect` v4) comme **modèle standard pour tout le code serveur** : domaine, services, accès DB, intégrations externes, scripts. Ce document est la référence pour les humains comme pour les agents IA.

## Principes

1. **Le domaine est en Effect, les frontières sont fines.** Les routes Astro (`APIRoute`), le frontmatter des pages, le middleware et les scripts CLI ne contiennent pas de logique : ils construisent un programme Effect et l'exécutent via le runtime partagé.
2. **Erreurs typées.** Toute erreur qu'un appelant peut vouloir traiter est une `Data.TaggedError`. Les bugs restent des *defects* (`Effect.die`, `Effect.orDie`).
3. **Dépendances via services.** Un service = un `Context.Service` + un `Layer` `XxxLive`. Pas d'import direct de singletons (pool DB, client S3, fetch…) dans le code Effect.
4. **Validation par `Schema`.** Toute entrée non fiable (JSON, FormData, query, env, payload webhook) passe par `decode(Schema)` → `ValidationError` avec issues par champ.
5. **Résilience explicite.** Les appels réseau ont un `Effect.timeout` et, s'ils sont idempotents, un `Effect.retry` avec `Schedule.exponential` + `Schedule.recurs`.

## Briques fournies (`src/lib/effect/`)

| Fichier | Rôle |
| --- | --- |
| `errors.ts` | Erreurs partagées : `DbError`, `NotFoundError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `RateLimitedError`, `UpstreamError`, `ConfigError`, `OperationError` (échec d'un appel Promise historique → 500) |
| `schema.ts` | `decode(schema)(input)`, `readJson(request)`, `formDataToRecord`, schémas communs (`Slug`, `NonEmptyTrimmed`) |
| `db.ts` | Service `Db` + `query(op, f)` + `transaction(op, f)` (rollback si l'Effect échoue, erreur typée re-propagée) |
| `config.ts` | Service `AppConfig` (env validé : `siteUrl`, `signingSecret`, `trustProxy`…) |
| `runtime.ts` | `AppLayer`, type `AppServices`, `appRuntime` (`ManagedRuntime` unique par process, survit au HMR) |
| `http.ts` | `apiRoute(handler)`, `runApp`, `runAppResult`, `json`, `errorResponse` (tag → statut HTTP) ; span par route, capture Sentry des defects et des 5xx |
| `route.ts` | Routes migrées qui gardent leur contrat HTTP historique : `legacyJson`, `attempt(op, f)` (Promise → `OperationError`), `rateLimit`, `retryAfterSeconds` |
| `action.ts` | Astro Actions : `effectHandler`, `ActionFailure`/`fail(code, message)`, `actionTry`, `requireActionPermission`, `actionRateLimit` (erreurs typées → `ActionError`) |
| `auth.ts` | `requireSessionPermission(locals, permissions)` pour les routes internes à session |
| `cron.ts` | `isCronAuthorized`, `requireCron` (Bearer `CRON_SECRET`, comparaison à temps constant) |

### Services du runtime (`AppLayer`)

| Service | Fichier | Rôle |
| --- | --- | --- |
| `Db` | `src/lib/effect/db.ts` | Accès Drizzle (`query`, `transaction`) |
| `AppConfig` | `src/lib/effect/config.ts` | Configuration validée |
| `Storage` | `src/lib/storage/` | Stockage médias local / S3 |
| `Mailer` | `src/smtp/mailer.ts` | Envoi email (pipeline `sendEmailEffect` : retries + dead-letter) ; `makeMemoryMailer` en test |
| `WebhookHttp` | `src/modules/webhooks/domain/http.ts` | Livraisons HTTP signées des webhooks sortants |
| `SearchIndex` | `src/lib/search/` | Recherche (`SEARCH_DRIVER` = postgres / meilisearch / pagefind) |
| `ErrorReporter` | `src/lib/observability/errors.ts` | Envoi des erreurs à Sentry (enveloppe HTTP, sans SDK) |
| (couche) `TelemetryLive` | `src/lib/observability/telemetry.ts` | Export OTLP des spans si `OTEL_EXPORTER_OTLP_ENDPOINT` |

Scripts `db:*` : `src/database/commands/_effect.ts` fournit `runScript(name, programme, { dispose })` et `step(name, f)` (`ScriptError`).

## Écrire un service

```ts
import { Context, Effect, Layer, Schema } from 'effect';
import { query } from '@/lib/effect/db';
import { NotFoundError } from '@/lib/effect/errors';

export class Widgets extends Context.Service<Widgets, {
  readonly get: (id: string) => Effect.Effect<Widget, NotFoundError | DbError>;
}>()('polyweb/Widgets') {}

export const WidgetsLive = Layer.effect(Widgets, Effect.gen(function* () {
  const db = yield* Db;
  return {
    get: (id) => Effect.gen(function* () {
      const [row] = yield* db.query('widgets.get', (d) => d.select().from(widgets).where(eq(widgets.id, id)));
      if (!row) return yield* new NotFoundError({ entity: 'Widget', id });
      return row;
    }),
  };
}));
```

Pour du code de domaine sans état propre, de simples fonctions qui retournent `Effect<A, E, Db>` (via `query`) suffisent — pas besoin d'un service pour chaque module.

Ajout au runtime : fusionner `WidgetsLive` dans `AppLayer` (`src/lib/effect/runtime.ts`) et ajouter `Widgets` à `AppServices`.

## Frontières Astro

```ts
// src/pages/api/v1/widgets/[id].ts
import { apiRoute, json } from '@/lib/effect/http';
export const GET = apiRoute(({ params }) =>
  Effect.gen(function* () {
    const w = yield* Widgets.use((s) => s.get(params.id!));
    return json({ data: w });
  }),
);
```

- `apiRoute` convertit `ValidationError` → 400 (avec `issues`), `UnauthorizedError` → 401, `ForbiddenError` → 403, `NotFoundError` → 404, `ConflictError` → 409, `RateLimitedError` → 429 (+ `Retry-After`), `UpstreamError` → 502, `DbError`/`ConfigError`/defects → 500 **sans détail interne**.
- Dans une page `.astro` : `const r = await runAppResult(programme)` puis `if (!r.ok) …` (les defects sont relancés → page d'erreur Astro).
- Dans un script CLI : `await runApp(programme)` puis `await appRuntime.dispose()`.

## Tests

- Unitaires : `Effect.runPromise(programme)` quand le programme n'a pas de dépendances, sinon `Effect.provide(programme, Layer.succeed(Service, fake))`.
- Intégration : `appRuntime.runPromise(...)` (vraie base de test).
- Vérifier une erreur typée : `await Effect.runPromise(Effect.flip(programme))` puis `expect(e).toBeInstanceOf(XxxError)`.

## À ne pas faire

- `try/catch` autour d'un `Effect.runPromise` dans le domaine (utiliser `Effect.catchTag`).
- `throw` dans un `Effect.gen` pour une erreur attendue (utiliser `yield* new XxxError(...)`).
- Créer un nouveau `ManagedRuntime` ailleurs que dans `runtime.ts`.
- Lire `process.env` dans le domaine (passer par `AppConfig`).
- Utiliser `zod` dans du nouveau code serveur : `Schema` d'Effect est la norme (zod reste pour `astro:content` et le code legacy en cours de migration).

## Migration du code existant

Le code antérieur est migré **par zones**, chaque zone gardant typecheck/tests/build verts. Quand des appelants non migrés existent (pages `.astro`, tests historiques), la zone expose l'implémentation Effect (`xxxEffect`) **et** un adaptateur Promise fin qui l'exécute et relève les classes d'erreur historiques.

État (vérifié le 18/10/2026, fichiers `.ts` important `effect` ou `@/lib/effect/*` / total) :

| Zone | État |
| --- | --- |
| `src/pages/api/**` | Toutes les routes passent par `apiRoute` ; seule `auth/[...all].ts` délègue directement à better-auth (adaptateur imposé par la lib). |
| `src/middleware.ts` | Effect via `src/lib/http/request-context.ts` (session avec timeout 5 s, hôte, site, 503). |
| Briques plateforme (contenu, API v1, webhooks, formulaires, plugins, sites, recherche, observabilité, sauvegarde, CLI) | Effect natif. |
| `src/modules/content/domain/entries.ts`, `revisions.ts`, `content-types.ts` | Effect natif + adaptateurs Promise (`runContent`). |
| `src/modules/sites/domain/sites.ts`, `src/lib/platform/admin.ts` | Effect natif + adaptateurs (`runSites`, `getAdminSiteEffect`, `userCanEffect`). |
| `src/modules/payments/domain/payment-service.ts` | Effect natif (timeout fournisseur 20 s, compensation) + adaptateurs. `providers.ts` (SDK Stripe/mock) reste en Promise, appelé sous timeout. |
| `src/smtp/send.ts`, `src/core/events`, `src/lib/audit.ts` | Effect natif + adaptateurs Promise. Fournisseurs SMTP (Brevo/Resend/Nodemailer) : frontières SDK en Promise, enveloppées par `sendEmailEffect`. |
| `src/core/crud/engine.ts` | `handleCrudEffect` natif ; `handleCrud` adaptateur (page admin CRUD). |
| `src/lib/auth-guards.ts` | `requireAuthEffect` / `requireAdminEffect` / `requirePermissionEffect` natifs ; versions `async` = adaptateurs pour les pages `.astro`. |
| `src/media/variants.ts`, `src/media/upload.ts` | Effect natif (`decodeAndValidateEffect`, `renderResponsiveVariantsEffect`, `generateResponsiveVariantsEffect`, `uploadFile`). |
| `src/lib/newsletter/blog-newsletter-service.ts` | Effect natif (`blogNewsletterServiceEffect`) + adaptateur `blogNewsletterService`. La transaction Drizzle reste un callback Promise. |
| `src/database/commands`, `src/smtp/commands` | Toutes les commandes `db:*` / `smtp:*` / `logs:rotate` s'exécutent via `runScript` (codes de sortie, `ScriptError`) ; `search.*` et `storage.push` sont Effect. **Partiel :** l'intérieur de `migrate`, `seed`, `sync`, `compare`… reste en Promise sous un `step` unique. |
| `src/actions` (49 fichiers, 142 handlers) | Tous les handlers passent par `effectHandler` + `actionTry` (span `action <fichier.export>`, `ActionError` préservée, sinon `OperationError`). Natifs : `admin/social`, `admin/contact`, `admin/hours`. **Partiel :** l'intérieur des autres handlers reste en Promise. |
| `src/database/loaders`, `src/modules/services/loaders`, `src/modules/services/admin/loader.ts`, `src/lib/auth-data.ts` | **Partiel :** façade `src/database/loaders/effect.ts` (`liftLoader` → `Effect<R, DbError>` + span) ; l'intérieur (requêtes Drizzle + cache TTL `cached()` partagé avec les pages) reste en Promise. |
| `src/lib/content/internal-link-resolver.ts` | Vue Effect du registre (`resolveInternalLinkEffect`, `listInternalLinkTargetsEffect`, `searchInternalLinksEffect` : timeout 10 s, `NotFoundError`/`DbError`). **Partiel :** les résolveurs blog/services restent des objets Promise (contrat ouvert aux modules). |
| `src/lib/auth.ts` (config + hooks better-auth), `src/modules/services/permissions` | Promise (callbacks imposés par better-auth ; assertions appelées à l'intérieur des actions déjà enveloppées). |
| Code client (`markdown-editor`, `media-picker-client`, `admin/confirmation`) | Hors périmètre (navigateur). |

## Verrou d'édition générique (`src/core/locks`)

Abstraction core, indépendante de l'entité, utilisable par tout module :

- `registerLockStore(resourceType, drizzleLockStore(resourceType, table, 'serviceId'), { ttlMs })` — un stockage
  par type de ressource ; toute table `{ <ressource> unique, userId, sessionId, lockedAt, expiresAt }` convient
  (aucune migration pour `service_locks` / `blog_post_locks`).
- `acquireLock` (atomique : `INSERT … ON CONFLICT DO UPDATE … WHERE expiré OU même propriétaire`),
  `releaseLock`, `ensureNotLockedByOther` (purge l'expiré), `ensureNoneLockedByOther` (actions groupées),
  `requireOwnLock` (ex. restauration de révision) ; `lockOwnerFrom(userId, sessionId)`.
- Politique unique (`policy.ts`) : propriétaire = utilisateur + session (session inconnue → utilisateur seul) ;
  un verrou expiré ne bloque jamais.
- Erreurs `LockHeldError` / `LockExpiredError` (messages fr/en/es/ar), traduites en `CONFLICT` par `toActionError`.
- `src/core/locks/service.ts` accède à la base : il s'importe explicitement (hors barrel `@/core`).

État : abstraction livrée et testée (`tests/unit/core-locks.test.ts`) ; **migration des appels services/blog
vers ce service : à faire** (les implémentations par module restent en place d'ici là).

## Helper unique d'accès base

`dbTry(operation, f, span?)` (`src/lib/effect/run.ts`) : `liftLoader`, `core/locks` et les résolveurs de liens
reposent dessus ; `runOrThrow` est l'adaptateur Promise des contrats ouverts (cause d'origine relevée).
