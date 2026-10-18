# AGENTS.md — guide pour les agents (et les humains)

Polyweb est un CMS Astro 7 (SSR, Node/Vercel) + Drizzle/PostgreSQL + Better Auth + Tailwind 4/Starwind.

## Règles non négociables

- **Effect partout côté serveur** : erreurs `Data.TaggedError`, services `Context.Service` + `Layer`, `Effect.gen`, validation `Schema`, timeouts/retries sur le réseau. Frontières Astro = adaptateurs fins (`apiRoute`, `runApp`, `runAppResult`) sur le `ManagedRuntime` partagé. Lire **`docs/effect.md`** avant d'écrire du code serveur.
- **Drizzle uniquement** (pas de Prisma). Pas de Lucia, pas de Decap. UI : Tailwind 4 + Starwind.
- **Pas de code copié** depuis zatchouli, astrowind ou ProtoZat (licence tierce incertaine).
- Ne jamais committer : secrets, `.env`, `dist/`, logs, `test-results/`, rapports de tests.
- Ne jamais force-push.

## Commandes

```bash
pnpm install
pnpm db:migrate            # applique src/database/migrations
pnpm db:seed --reset       # données de démo (vide les tables sauf l'historique de migration)
pnpm dev
pnpm check                 # astro check (types)
pnpm lint
pnpm test                  # vitest (unit + intégration, base polyweb_test)
pnpm test:e2e              # Playwright
pnpm build
```

Migrations : modifier `src/database/schemas/*.schema.ts`, puis `pnpm drizzle-kit generate --name <nom>`, puis `pnpm db:migrate`.

## Arborescence utile

- `src/lib/effect/` — runtime, Db, AppConfig, erreurs (`OperationError` inclus), adaptateurs HTTP (`http.ts`, `route.ts`), Actions (`action.ts` : `effectHandler`), cron, auth.
- Services Effect du runtime : `Db`, `AppConfig`, `Storage`, `Mailer`, `WebhookHttp`, `SearchIndex`, `ErrorReporter` (+ couche `TelemetryLive`). Scripts `db:*` : `runScript` (`src/database/commands/_effect.ts`).
- Nouvelle action Astro : `handler: effectHandler((input, ctx) => Effect.gen(...))` avec `requireActionPermission` / `actionRateLimit` / `fail(code, message)`.
- État de la migration Effect (zones encore en Promise) : tableau en fin de `docs/effect.md`.
- `src/core/` — contrats de plateforme (modules, blocs, types de contenu, événements…).
- `src/modules/<module>/` — modules métier (`module.ts` = définition `PolywebModuleDefinition`, `domain/` = logique).
- `src/pages/[lang]/admin/` — back-office (POST traité dans le frontmatter → redirection 303 `?saved=`).
- `src/pages/api/` — API ; `src/pages/api/v1/` = API REST publique à jetons.
- `tests/unit`, `tests/integration`, `tests/e2e`.

## Pièges connus

- CSP stricte : pas de `<script>`/`style=""` inline, utiliser des scripts bundlés.
- Un module qui active la capacité `search` doit fournir `searchDefinition` (sinon crash au bootstrap).
- Better Auth 1.7 : comptes credential avec `accountId === userId` ; hacher via `(await auth.$context).password.hash`.
- Les permissions admin passent par `requirePermission` / `userCan`.
