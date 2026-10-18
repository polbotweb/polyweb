# Polyweb

CMS SSR multilingue construit sur **Astro 6** (adaptateur Node, Vercel en option), **Drizzle ORM + PostgreSQL**, **better-auth**, **Tailwind CSS 4 / Starwind** et **Effect 4** pour tout le code serveur.

Polyweb part de la base `atomic` et y fusionne des briques reprises (et réécrites) d'autres dépôts d'ishaq74 : atlaselle, moda, concordia, les-rochers-blancs, antx, annuaire2. On y a ajouté les briques CMS (a)–(n) décrites plus bas.

> **Licence : à choisir.** Le dépôt ne contient volontairement **aucun fichier LICENSE** pour l'instant. Aucun code de zatchouli, astrowind ou ProtoZat n'a été copié (licence tierce incertaine).

L'inventaire fichier par fichier hérité d'atomic (en anglais, en partie obsolète) est archivé dans [`docs/reference/atomic-readme.en.md`](docs/reference/atomic-readme.en.md).

---

## Sommaire

- [Pile technique](#pile-technique)
- [Démarrage](#démarrage)
- [Briques CMS (a)–(n)](#briques-cms-an)
- [Fusions depuis les autres dépôts](#fusions-depuis-les-autres-dépôts)
- [Effect côté serveur](#effect-côté-serveur)
- [Commandes](#commandes)
- [Qualité : état vérifié](#qualité--état-vérifié)
- [Limites connues](#limites-connues)
- [Documentation](#documentation)

## Pile technique

| Domaine | Choix |
| --- | --- |
| Framework | Astro 6 SSR (`@astrojs/node` ; `ASTRO_ADAPTER=vercel` possible) |
| Données | PostgreSQL (17 testé en local), **Drizzle uniquement** (pas de Prisma) |
| Authentification | better-auth : email/mot de passe, organisations, rôles, 2FA TOTP, passkeys, OAuth GitHub/Google, OTP par email (pas de Lucia) |
| UI | Tailwind CSS 4, composants Starwind, éditeur de blocs TipTap, EasyMDE (Markdown). Pas de Decap. |
| Serveur | Effect 4.0.5 : erreurs typées, services `Context`/`Layer`, `Schema`, retries et timeouts, `ManagedRuntime` partagé |
| i18n | fr, en, es, ar (RTL), routes localisées |
| Tests | Vitest (unitaires et intégration sur une vraie base Postgres), Playwright (e2e, axe-core, régression visuelle) |

## Démarrage

Prérequis : Node ≥ 22.12, pnpm 10, PostgreSQL.

```bash
pnpm install
cp .env.example .env            # renseigner DATABASE_URL_LOCAL, BETTER_AUTH_SECRET, POLYWEB_SIGNING_SECRET…
pnpm db:wait && pnpm db:migrate && pnpm db:seed
pnpm dev
```

Pour un nouveau projet, le CLI `create-polyweb` (brique n) clone le gabarit, génère des secrets aléatoires dans `.env` et peut lancer `git init` et `pnpm install`. Voir [`packages/create-polyweb/README.md`](packages/create-polyweb/README.md).

Variables principales (liste complète et commentée dans `.env.example`) : `DB_ENV`, `DATABASE_URL_LOCAL|PROD|TEST`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SITE_URL`, `POLYWEB_SIGNING_SECRET`, `CRON_SECRET`, `SMTP_*`, `STORAGE_DRIVER` (`local` | `s3`), `SEARCH_DRIVER` (`postgres` | `meilisearch` | `pagefind`), `PAYMENTS_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `SENTRY_DSN`.

## Briques CMS (a)–(n)

Légende : ✅ fait et testé · ⚠️ partiel (les manques sont listés dans la ligne).

| Brique | État | Contenu | Limites |
| --- | --- | --- | --- |
| **a.** Blocs | ✅ | Registre de blocs typés, rendu sûr TipTap JSON → HTML, `BlockEditor` et `BlockRenderer` | ⚠️ Pas de bloc « formulaire » dans TipTap |
| **b.** Types de contenu | ✅ | Types définis depuis l'admin (schéma JSONB dynamique), entrées traduites avec blocs, singleton, slug | — |
| **c.** API REST v1 | ✅ | `/api/v1/**`, jetons d'API à portées, limitation de débit, OpenAPI 3.1 dynamique | ⚠️ `/api/v1/search` absent du document OpenAPI |
| **d.** Webhooks sortants | ✅ | Signature HMAC, garde SSRF, retries persistants, cron de relivraison, ping et rotation de secret | — |
| **e.** Stockage | ✅ | Service `Storage` (disque local ou S3/R2), pipeline médias, variantes WebP | ⚠️ `storage:push` ne réécrit pas les URL déjà en base |
| **f.** Aperçu et révisions | ✅ | Liens d'aperçu signés (24 h, version figée possible), diff de révisions mot à mot, restauration | ⚠️ Révocation d'un lien uniquement par rotation du secret |
| **g.** Formulaires | ✅ | Constructeur de formulaires, page publique sans JS, anti-spam, soumissions, export CSV, email via `Mailer` | ⚠️ Pas de bloc TipTap pour insérer un formulaire |
| **h.** Authentification avancée | ✅ | 2FA TOTP (QR, codes de secours), passkeys, OAuth GitHub/Google, OTP par email | — |
| **i.** Plugins | ✅ | `definePlugin`, blocs et hooks d'événements, réglages validés, activation depuis l'admin ; exemples `faq-block` et `form-autoreply` | ⚠️ Pas de routes de plugin ; réglages globaux (pas par site) |
| **j.** Multi-site | ⚠️ | Sites par nom d'hôte ; admin des sites (création, bascule, édition, suppression). Types, entrées, formulaires, jetons et webhooks sont scopés par site. | ⚠️ Blog, services, pages et navigation (modules hérités d'atomic) restent **communs à tous les sites** |
| **k.** Recherche | ✅ | Service `SearchIndex` : pilote Postgres FTS ou Meilisearch (retries, attente des tâches), export Pagefind statique, indexation sur les événements `content.*`, `/api/v1/search`, cron de réindexation | ⚠️ Contenus hérités (blog, services, pages) réindexés seulement via le CLI ou le cron |
| **l.** Observabilité | ✅ | Spans Effect exportés en OTLP (si `OTEL_EXPORTER_OTLP_ENDPOINT`), remontée des erreurs vers Sentry par l'API HTTP (sans SDK), span par requête | ⚠️ Pas de propagation `traceparent` ; pas d'envoi de source maps |
| **m.** Sauvegarde et restauration | ✅ | `db:backup` (pg_dump format custom, manifeste, sha256, médias, rotation) et `db:restore` (vérification, compatibilité des migrations, `pg_restore` en une transaction) | ⚠️ Ni chiffrement ni envoi hors site |
| **n.** CLI `create-polyweb` | ✅ | Gabarit GitHub ou dépôt local, `.env` avec secrets aléatoires, git, installation | — |

## Fusions depuis les autres dépôts

| Origine | Apport |
| --- | --- |
| atlaselle | Variantes d'images WebP responsives (Sharp), générateur `module:new`, module de paiements générique (Stripe via `fetch` et un fournisseur fictif signé) |
| moda | Générateur CRUD `api:generate` (idée reprise, code réécrit et sécurisé), tests des plugins admin/organisation de better-auth |
| concordia | Éditeur Markdown EasyMDE relié au MediaPicker, bascule d'adaptateur Node/Vercel |
| les-rochers-blancs | `SEOHead`/`JsonLd`, profil Caddy, devcontainer, `db:wait`, `db:baseline`, `admin:create` |
| antx | Tests e2e axe-core, régression visuelle, pipeline de prévisualisation de PR |
| annuaire2 | L'OTP maison est remplacé par le plugin OTP par email de better-auth (brique h) |

## Effect côté serveur

Les conventions et l'état de la migration zone par zone sont décrits dans [`docs/effect.md`](docs/effect.md) ; les consignes pour les agents sont dans [`AGENTS.md`](AGENTS.md). En bref :

- Les briques a–n sont écrites nativement en Effect.
- Toutes les routes `src/pages/api/**` passent par `apiRoute`, sauf le point d'entrée better-auth.
- Sont aussi en Effect natif, avec des adaptateurs Promise pour l'appelant historique : le pipeline SMTP, le bus d'événements, l'audit, les entrées de contenu, les révisions et les paiements.
- Les commandes `db:wait`, `db:cleanup-audit`, `db:backup` et `db:restore` passent par `runScript`.
- L'adaptateur `effectHandler` existe pour les Astro Actions.
- ⚠️ **Partiel** : la plupart des Astro Actions (46 fichiers sur 49), les loaders `src/database/loaders`, `src/lib/auth*`, `src/media/variants.ts`, une grande partie de `src/core` et les modules historiques blog/services restent en Promise.

## Commandes

| Commande | Rôle |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm preview` | Développement, build et prévisualisation |
| `pnpm check` | `astro check` (gate de typage) |
| `pnpm lint` | ESLint (fichiers `.astro`) |
| `pnpm test` | Vitest (base `DATABASE_URL_TEST` requise pour l'intégration) |
| `pnpm playwright test` | E2E (build + preview sur le port 4322) |
| `pnpm db:migrate` / `db:seed` / `db:reset` / `db:wait` | Base de données |
| `pnpm db:backup [--media] [--keep N]` / `pnpm db:restore <archive> [--verify-only] [--yes] [--media]` | Sauvegarde et restauration |
| `pnpm search:reindex` / `pnpm search:pagefind` | Recherche |
| `pnpm storage:push` | Copie des médias locaux vers S3/R2 |
| `pnpm module:new` / `pnpm api:generate` | Générateurs |
| `pnpm cli:build` | Build du CLI `create-polyweb` |

## Qualité : état vérifié

Mesures du 18/10/2026 sur `main` (Node 22, PostgreSQL 17 local) :

| Gate | Résultat |
| --- | --- |
| `pnpm install --frozen-lockfile` | OK |
| `astro check` | 0 erreur, 0 avertissement, 69 suggestions (1 089 fichiers) |
| `pnpm lint` | 0 erreur, 21 avertissements |
| Vitest, Postgres réel, Meilisearch réel via `MEILI_TEST_BIN` | 149 fichiers, **1 490 tests réussis** |
| `pnpm build` | OK |
| Playwright chromium (suite complète) | voir [`TODO.md`](TODO.md), section « État vérifié » |

`tsc` brut (hors `astro check`) remonte encore des erreurs de typage héritées dans des fichiers non couverts par `astro check` ; ce n'est pas un gate.

## Limites connues

- Les points ⚠️ du tableau des briques.
- La migration Effect est incomplète (voir ci-dessus).
- Des tests e2e hérités d'atomic échouent déjà sur la base importée : cycle de vie des services, redirection de catégorie erronée des services. Le détail est dans [`TODO.md`](TODO.md).

## Documentation

`docs/effect.md` (conventions serveur), `docs/plugins.md`, `docs/search.md`, `docs/observability.md`, `docs/backup.md`, `docs/security.md`, `docs/rate-limit.md`, `docs/middleware.md`, `docs/testing/`, `docs/architecture/`, `docs/cms/`.
