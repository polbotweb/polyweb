# Testing — Rapport & Index

> **Projet** : Atomic  
> **Stack** : Astro 6 + better-auth + Drizzle/PostgreSQL + Vitest + Playwright + Pa11y + Lighthouse  
> **Couverture globale** : **741 tests** · **102 audits e2e** · **52 URLs a11y** · **62 fichiers de test** · **5 générateurs de rapports**  
> **Dernière mise à jour** : 31/03/2026

---

## Table des matières

| Document | Contenu |
| :-- | :-- |
| [setup.md](setup.md) | Installation, configuration Vitest/Playwright, scripts, CI/CD |
| [unit.md](unit.md) | Tests unitaires — détail de chaque test, matrice de couverture |
| [integration.md](integration.md) | Tests d'intégration — better-auth testUtils, sessions, admin, orgs, audit, export |
| [e2e.md](e2e.md) | Tests E2E Playwright — pages publiques, guards, auth flow, global-setup |
| [a11y.md](a11y.md) | **Accessibilité & Performance** — Pa11y-ci (WCAG AAA) + Lighthouse CI |
| [ci.md](ci.md) | Pipeline GitHub Actions — 4 jobs qualité + deploy + summary |
| [gaps.md](gaps.md) | **Failles & manques** — tout ce qui reste à tester, par priorité |

---

## Résumé des résultats

### Par type de test

| Type | Fichiers | Tests/Audits | Status |
| :-- | :-- | :-- | :-- |
| Unit | 48 | 656 | ✅ 656/656 |
| Integration | 11 | 85 | ✅ 85/85 |
| E2E (Playwright) | 3 | 34 (×3 browsers = 102) | ✅ 0 skip déclarés ; Chromium + Firefox + WebKit |
| A11y — Pa11y-ci (WCAG AAA) | 1 config | 52 URLs | ✅ 52/52 |
| A11y — Lighthouse CI | 3 configs | 52 URLs | ✅ Configuration stabilisée (`maxWaitForLoad`, flags Chrome) |
| **Total** | **62** (+11 support) | **741 tests + 52 a11y audits + 102 e2e** | |

### Coverage v8 (seuils vitest.config.ts)

| Métrique | Résultat | Seuil | Status |
| :-- | --: | --: | :-- |
| Statements | 90.22% | 80% | ✅ |
| Branches | 80.70% | 75% | ✅ |
| Functions | 85.03% | 75% | ✅ |
| Lines | 90.76% | 80% | ✅ |

### Fichiers support

| Fichier | Rôle |
| :-- | :-- |
| `tests/helpers/auth.ts` | Helper partagé : `getTestHelpers()`, ré-exporte `auth` |
| `tests/e2e/global-setup.ts` | Seed un user vérifié admin avant les E2E |
| `tests/e2e/global-teardown.ts` | Supprime le seed user après les E2E |
| `tests/a11y/setup.ts` | Seed 2 users (normal + admin) + export cookies pour Pa11y/LHCI |
| `tests/a11y/run.cjs` | Orchestrateur : build + serveur + audits + teardown |
| `tests/a11y/lhci-authed.cjs` | Exécute LHCI pour les pages authentifiées/admin |
| `tests/a11y/lhci-rename.cjs` | Renomme les rapports LHCI en noms lisibles |
| `tests/helpers/vitest-report.cjs` | Génère `tests/reports/vitest-report.txt` depuis le JSON Vitest |
| `tests/helpers/playwright-report.cjs` | Génère `tests/reports/playwright-report.txt` depuis le JSON Playwright |
| `tests/helpers/lighthouse-report.cjs` | Génère `tests/reports/lighthouse-report.txt` (scores, CWV, audits échoués) |
| `.pa11yci.cjs` | Configuration Pa11y-ci (52 URLs, WCAG AAA, axe) |
| `lighthouserc.cjs` | Configuration Lighthouse CI (28 URLs publiques, ≥0.9 gates) |

### Par module source — Couverture v8

| Module | Stmts | Branches | Funcs | Lines | Détail |
| :-- | --: | --: | --: | --: | :-- |
| `src/actions/admin/` | 90.56% | 75.81% | 86.11% | 91.26% | 10 actions, 70+ tests unitaires |
| `src/lib/` | 92.15% | 89.88% | 90.00% | 94.11% | audit, rate-limit, sanitize, store, theme-tokens |
| `src/i18n/` | 100% | 100% | 100% | 100% | config + utils |
| `src/database/` | 89.69% | 79.06% | 95.00% | 89.41% | cache, env, schemas |
| `src/database/loaders/` | 88.67% | 86.36% | 66.66% | 87.23% | navigation.loader |
| `src/database/schemas/` | 77.52% | 100% | 67.21% | 75.00% | déclaratif Drizzle |
| `src/media/` | 92.22% | 80.95% | 100% | 94.04% | upload, delete, list |

---

## Matrice complète : Fonction → Test

### `src/lib/` — Services & Utilitaires

| Fonction | Fichier source | Type | Test | Status |
| :-- | :-- | :-- | :-- | :-- |
| `checkRateLimit(key, opts)` | `src/lib/rate-limit.ts` | Pure | `tests/unit/rate-limit.test.ts` | ✅ 8 tests |
| `extractIp(headers)` | `src/lib/audit.ts` | Pure | `tests/unit/extract-ip.test.ts` | ✅ 8 tests |
| `logAuditEvent(input)` | `src/lib/audit.ts` | Side-effect (DB) | `tests/integration/audit.test.ts` + `tests/unit/audit-fallback.test.ts` | ✅ 6+1 tests |
| `auth` (instance) | `src/lib/auth.ts` | Config | `tests/integration/auth.test.ts` + `auth-advanced.test.ts` + `auth-org.test.ts` | ✅ 42 tests |
| `authClient` | `src/lib/auth-client.ts` | Client-side | — | ❌ Non testé |

### `src/i18n/` — Internationalisation

| Fonction | Fichier source | Type | Test | Status |
| :-- | :-- | :-- | :-- | :-- |
| `toLocale(value)` | `src/i18n/utils.ts` | Pure | `tests/unit/i18n-utils.test.ts` | ✅ 2 tests |
| `isRTL(locale)` | `src/i18n/utils.ts` | Pure | `tests/unit/i18n-utils.test.ts` | ✅ 2 tests |
| `getDirection(locale)` | `src/i18n/utils.ts` | Pure | `tests/unit/i18n-utils.test.ts` | ✅ 2 tests |
| `getCommonTranslations(locale)` | `src/i18n/utils.ts` | Async import | `tests/unit/i18n-urls.test.ts` | ✅ 4 tests (×4 locales) |
| `getAuthTranslations(locale)` | `src/i18n/utils.ts` | Async import | `tests/unit/i18n-urls.test.ts` | ✅ 4 tests (×4 locales) |
| `getHomeTranslations(locale)` | `src/i18n/utils.ts` | Async import | `tests/unit/i18n-translations.test.ts` | ✅ 4 tests (×4 locales) |
| `getAboutTranslations(locale)` | `src/i18n/utils.ts` | Async import | `tests/unit/i18n-translations.test.ts` | ✅ 4 tests (×4 locales) |
| `getContactTranslations(locale)` | `src/i18n/utils.ts` | Async import | `tests/unit/i18n-translations.test.ts` | ✅ 4 tests (×4 locales) |
| `getAuthUrl(locale, pageId, t)` | `src/i18n/utils.ts` | Pure | `tests/unit/i18n-urls.test.ts` | ✅ 4 tests (×4 locales) |
| `resolveAuthSlug(slug, t)` | `src/i18n/utils.ts` | Pure | `tests/unit/i18n-urls.test.ts` | ✅ 4+1 tests |
| `getPageUrl(locale, pageId, t)` | `src/i18n/utils.ts` | Pure | `tests/unit/i18n-urls.test.ts` | ✅ 2 tests (×2 locales) |
| `resolvePageSlug(slug, t)` | `src/i18n/utils.ts` | Pure | `tests/unit/i18n-urls.test.ts` | ✅ 2+1 tests |
| `LOCALES`, `DEFAULT_LOCALE`, etc. | `src/i18n/config.ts` | Constantes | Implicitement via tous les tests i18n | ⚠️ Implicite |

### `src/database/` — Base de données

| Fonction | Fichier source | Type | Test | Status |
| :-- | :-- | :-- | :-- | :-- |
| `getDrizzle()` | `src/database/drizzle.ts` | Singleton | `tests/integration/db-health.test.ts` | ✅ 1 test (singleton) |
| `checkConnection()` | `src/database/drizzle.ts` | Health check | `tests/integration/db-health.test.ts` | ✅ 1 test (ok + latency) |
| Raw SQL query | `src/database/drizzle.ts` | Connexion | `tests/integration/db-health.test.ts` | ✅ 1 test |
| `maskUrl(url)` | `src/database/env.ts` | Pure | `tests/unit/mask-utils.test.ts` | ✅ 3 tests |
| `dbNameFromUrl(url)` | `src/database/env.ts` | Pure | `tests/unit/mask-utils.test.ts` | ✅ 3 tests |
| `formatPgError(err)` | `src/database/commands/_utils.ts` | Pure | `tests/unit/cli-utils.test.ts` | ✅ 10 tests |
| ANSI helpers (`c.green`, `c.red`) | `src/database/commands/_utils.ts` | Pure | `tests/unit/cli-utils.test.ts` | ✅ 2 tests |
| Schema exports (8 tables) | `src/database/schemas.ts` | Exports | `tests/unit/schema-validation.test.ts` | ✅ 12 tests |
| CMS schemas (7 tables) | `src/database/schemas/site.schema.ts`, `navigation.schema.ts` | Déclaratif | `tests/unit/cms-schemas.test.ts` | ✅ 80 tests |
| CMS seed data (6 fichiers) | `src/database/data/03-08` | Données | `tests/unit/cms-seeds.test.ts` | ✅ 11 tests |
| CMS loaders | `src/database/loaders/site.loader.ts`, `navigation.loader.ts` | Async DB | Indirectement via E2E | ⚠️ Implicite |
| `getPgClient()` | `src/database/drizzle.ts` | Connexion | — | ❌ Non testé |
| `shutdownDb()` | `src/database/drizzle.ts` | Cleanup | — | ❌ Non testé |

### `src/actions/admin/` — Actions CMS

| Action | Fichier source | Test unitaire | Status |
| :-- | :-- | :-- | :-- |
| `upsertSiteSettings` / `updateSiteSettings` | `site.ts` | `tests/unit/admin-site.test.ts` (6) | ✅ |
| `createSocialLink` / `update` / `delete` / `reorder` | `social.ts` | `tests/unit/admin-social.test.ts` (9) | ✅ |
| `updateContactInfo` | `contact.ts` | `tests/unit/admin-contact.test.ts` (10) | ✅ |
| `updateOpeningHours` | `hours.ts` | `tests/unit/admin-hours.test.ts` (13) | ✅ |
| `createNavigationItem` / `update` / `delete` / `reorder` | `navigation.ts` | `tests/unit/admin-navigation-items.test.ts` (11) | ✅ |
| `createTheme` / `update` / `delete` | `theme.ts` | `tests/unit/admin-theme.test.ts` (10) | ✅ |
| `createPage` / `update` / `delete` / `publish` | `pages.ts` | `tests/unit/admin-pages.test.ts` (14) | ✅ |
| `createSection` / `update` / `delete` / `reorder` | `sections.ts` | `tests/unit/admin-sections.test.ts` (15) | ✅ |
| `createMenu` / `updateMenu` / `deleteMenu` | `menus.ts` | ⚠️ E2E only | ⚠️ |
| `assertAdmin` / `adminRateLimit` / `auditAdmin` | `_helpers.ts` | Couvert via toutes les actions ci-dessus | ✅ |

### `src/smtp/` — Email

| Fonction | Fichier source | Type | Test | Status |
| :-- | :-- | :-- | :-- | :-- |
| `sendEmail(payload)` | `src/smtp/send.ts` | Side-effect | `tests/unit/send-email.test.ts` | ✅ 7 tests (mock + retry) |
| `maskApiKey(key)` | `src/smtp/env.ts` | Pure | `tests/unit/mask-utils.test.ts` | ✅ 4 tests |
| `getSmtpProvider()` | `src/smtp/env.ts` | Config | Indirectement via `send-email` | ⚠️ Implicite |
| `getSmtpFrom()` | `src/smtp/env.ts` | Config | `tests/unit/smtp-env.test.ts` | ✅ 3 tests |
| Providers (brevo, resend, nodemailer) | `src/smtp/providers/` | Side-effect | Mockés dans `send-email.test.ts` | ✅ Mockés |

### `src/middleware.ts` — Session injection

| Fonction | Fichier source | Type | Test | Status |
| :-- | :-- | :-- | :-- | :-- |
| `onRequest` (session injection) | `src/middleware.ts` | Middleware | `tests/integration/middleware.test.ts` | ✅ 4 tests |
| `getDbEnv()` | `src/database/env.ts` | Pure | — | ❌ Non testé |
| `isProd()` / `isTest()` / `isLocal()` | `src/database/env.ts` | Pure | — | ❌ Non testé |
| `getDbUrl(env?)` | `src/database/env.ts` | Env reader | — | ❌ Non testé |
| `getPoolConfig(env?)` | `src/database/env.ts` | Pure | — | ❌ Non testé |
| Schemas (8 tables) | `src/database/schemas/` | Déclaratif | — | ❌ Non testé |
| CLI: `db.check`, `db.migrate`, etc. | `src/database/commands/` | Scripts | — | ❌ Non testé |
| `_utils.ts` helpers | `src/database/commands/_utils.ts` | Utilitaires | — | ❌ Non testé |

### `src/pages/api/` — Routes API

| Endpoint | Fichier source | Méthode | Test | Status |
| :-- | :-- | :-- | :-- | :-- |
| `/api/auth/[...all]` | `src/pages/api/auth/[...all].ts` | ALL | `tests/integration/auth.test.ts` + `auth-flow.test.ts` | ✅ 18 tests |
| `/api/upload` | `src/pages/api/upload.ts` | POST | `tests/unit/upload.test.ts` | ✅ Indirect (unit) |
| `/api/export-data` | `src/pages/api/export-data.ts` | GET | `tests/integration/export.test.ts` | ✅ 3 tests |

### `src/media/` — Upload & Fichiers

| Fonction | Fichier source | Type | Test | Status |
| :-- | :-- | :-- | :-- | :-- |
| `processUpload(file, opts)` | `src/media/upload.ts` | I/O (disque) | `tests/unit/upload.test.ts` | ✅ 5 tests |
| `deleteUpload(url)` | `src/media/delete.ts` | I/O (disque) | `tests/unit/upload.test.ts` | ✅ 2 tests |
| `UPLOAD_DIRS`, `ALLOWED_MIME_TYPES`, `DEFAULT_MAX_SIZE` | `src/media/types.ts` | Constantes | `tests/unit/upload.test.ts` | ✅ 3 tests |
| `UploadError` | `src/media/upload.ts` | Classe | `tests/unit/upload.test.ts` | ✅ Implicite |

### `src/smtp/` — Emails

| Fonction | Fichier source | Type | Test | Status |
| :-- | :-- | :-- | :-- | :-- |
| `maskApiKey(key)` | `src/smtp/env.ts` | Pure | `tests/unit/mask-utils.test.ts` | ✅ 4 tests |
| `sendEmail(payload)` | `src/smtp/send.ts` | Side-effect (réseau) | `tests/unit/send-email.test.ts` | ✅ 7 tests (mock + retry) |
| `getSmtpProvider()` | `src/smtp/env.ts` | Env reader | Indirectement via `send-email` | ⚠️ Implicite |
| `getSmtpFrom()` | `src/smtp/env.ts` | Env reader | `tests/unit/smtp-env.test.ts` | ✅ 3 tests |
| `getNodemailerConfig()` | `src/smtp/env.ts` | Env reader | — | ❌ Non testé |
| Autres config providers | `src/smtp/env.ts` | Env readers | — | ❌ Non testé |

### `src/middleware.ts` — Middleware Astro

| Fonction | Fichier source | Type | Test | Status |
| :-- | :-- | :-- | :-- | :-- |
| `onRequest` | `src/middleware.ts` | Middleware | — | ❌ Non testé |

### `src/components/pages/` — Pages Astro

| Composant | Test E2E | Test Container | Status |
| :-- | :-- | :-- | :-- |
| `SignInPage.astro` | ✅ Form + auth flow (app + auth.spec) | — | ✅ E2E |
| `SignUpPage.astro` | ✅ Form + submit (auth.spec) | — | ✅ E2E |
| `DashboardPage.astro` | ✅ Guard redirect + auth flow (auth.spec) | — | ✅ E2E |
| `AdminStatsPage.astro` | ✅ Guard redirect | — | ⚠️ Guard seul |
| `AdminUsersPage.astro` | ✅ Guard redirect | — | ⚠️ Guard seul |
| `AdminOrgsPage.astro` | ✅ Guard redirect | — | ⚠️ Guard seul |
| `AdminAuditPage.astro` | ✅ Guard redirect | — | ⚠️ Guard seul |
| `ProfilePage.astro` | ✅ Guard redirect | — | ⚠️ Guard seul |
| `OrgMembersPage.astro` | ✅ Guard redirect (auth.spec) | — | ⚠️ Guard seul |
| `OrgSettingsPage.astro` | ✅ Guard redirect | — | ⚠️ Guard seul |
| `ForgotPasswordPage.astro` | ✅ Form visible (auth.spec) | — | ⚠️ E2E seul |
| `ResetPasswordPage.astro` | ✅ Accessible sans auth (auth.spec) | — | ⚠️ E2E seul |
| `VerifyEmailPage.astro` | ✅ Accessible sans auth (auth.spec) | — | ⚠️ E2E seul |
| `HomePage.astro` | ✅ Homepage load + i18n | — | ✅ E2E |
| `LegalPage.astro` | ✅ Charge correctement (auth.spec) | — | ✅ E2E |
| `ContactPage.astro` | ✅ Charge correctement (auth.spec) | — | ✅ E2E |
| `AboutPage` sections | ✅ Charge correctement (auth.spec) | — | ✅ E2E |

---

## Score global

```text
 Vitest (unit + intégration) :  741 tests          ✅ 100% pass
 Coverage v8 :                  90%+ stmts/lines    ✅ Tous seuils dépassés
 Playwright E2E :               34 scénarios / 102 exécutions   ✅ 0 skip déclarés
 Pa11y WCAG AAA :               52/52 URLs           ✅ 0 violations
 Lighthouse CI :                ✅ Configuration durcie pour CI (NO_NAVSTART corrigé)
```

> **Chemins critiques couverts** : auth (sign-up/sign-in/sign-out), admin CRUD complet (10 actions × handler + Zod validation), RGPD (export, suppression user), audit (hooks + insert), upload (validation, sécurité), i18n (URLs, slugs, translations), accessibilité (WCAG AAA 52 URLs).

---

## Commandes — Référence rapide

### Pipeline complète (avec DB + serveur)

```bash
pnpm qa                       # Tout d'un coup : check → build → lint → test+coverage → e2e → a11y
```

### Pipeline hors-ligne (sans DB)

```bash
pnpm qa:offline               # check → build → lint → test+coverage + rapport
```

### Étapes individuelles

| Commande | Description | Pré-requis |
| :-- | :-- | :-- |
| `pnpm check` | Type-check Astro (astro check) | — |
| `pnpm build` | Build production SSR | — |
| `pnpm lint` | ESLint src/**/*.{js,ts,astro} | — |
| `pnpm test` | Vitest run (741 tests) | — |
| `pnpm test -- --coverage` | + coverage v8 | — |
| `pnpm test:watch` | Vitest en mode watch | — |
| `pnpm test:report` | Génère `tests/reports/vitest-report.txt` | Après `pnpm test` |
| `pnpm test:e2e` | Playwright (3 browsers, auto-preview) | DB + build |
| `pnpm test:e2e:ui` | Playwright UI mode | DB + build |
| `pnpm test:e2e:report` | Génère `tests/reports/playwright-report.txt` | Après `pnpm test:e2e` |
| `pnpm a11y` | **Orchestrateur complet** : build → preview → setup → pa11y → lighthouse → teardown | DB |
| `pnpm a11y:pa11y-only` | Pa11y uniquement (via orchestrateur) | DB |
| `pnpm a11y:lighthouse-only` | Lighthouse uniquement (via orchestrateur) | DB |
| `pnpm a11y:setup` | Seed users a11y + export cookies | DB + preview |
| `pnpm a11y:teardown` | Supprime les users a11y | DB |
| `pnpm a11y:pa11y` | Pa11y-ci brut (52 URLs) | Preview + cookies |
| `pnpm a11y:lighthouse` | LHCI autorun (pages publiques) | Preview |
| `pnpm a11y:lighthouse:authed` | LHCI pages auth/admin | Preview + cookies |
| `pnpm a11y:lighthouse:rename` | Renomme rapports LHCI | Après LHCI |
| `pnpm a11y:report` | Génère rapport texte Lighthouse | Après LHCI |

### Base de données

| Commande | Description |
| :-- | :-- |
| `pnpm db:check` | Vérifier connexion + lister tables/contraintes |
| `pnpm db:migrate` | Appliquer les migrations Drizzle |
| `pnpm db:generate` | Générer une nouvelle migration |
| `pnpm db:infra` | Appliquer indexes + triggers SQL |
| `pnpm db:seed` | Insérer les données de base |
| `pnpm db:reset` | Reset complet de la DB |
| `pnpm db:sync` | Sync schéma → DB (dev) |
| `pnpm db:compare` | Comparer schéma TS vs DB |
| `pnpm db:cleanup-audit` | Purger les anciens logs d'audit |

### SMTP

| Commande | Description |
| :-- | :-- |
| `pnpm smtp:check` | Vérifier la config SMTP |
| `pnpm logs:rotate` | Rotation des dead-letter logs |

---

## Rapports — Où trouver quoi

| Rapport | Emplacement | Généré par |
| :-- | :-- | :-- |
| Vitest JSON | `tests/reports/vitest-results.json` | `pnpm test` (auto) |
| Vitest texte | `tests/reports/vitest-report.txt` | `pnpm test:report` |
| Coverage JSON | `tests/reports/coverage/coverage-summary.json` | `pnpm test -- --coverage` |
| Playwright JSON | `tests/reports/playwright-results.json` | `pnpm test:e2e` (auto) |
| Playwright HTML | `tests/reports/playwright/` | `pnpm test:e2e` (auto) |
| Playwright texte | `tests/reports/playwright-report.txt` | `pnpm test:e2e:report` |
| Pa11y JSON | `tests/reports/pa11y-results.json` | `pnpm a11y` |
| Pa11y texte | `tests/reports/pa11y-report.txt` | `pnpm a11y` |
| Lighthouse HTML+JSON | `.lighthouseci/` → `tests/reports/lighthouse/` | `pnpm a11y` |
| Lighthouse texte | `tests/reports/lighthouse-report.txt` | `pnpm a11y:report` |

> **Tous les artifacts `tests/reports/*/` sont dans .gitignore**. Seuls les fichiers de config (*.cjs) et les tests sont commités.

### Flux des rapports — Comment ça marche

Le pipeline de rapports fonctionne en **2 étapes** :

1. **Étape auto** — Le runner de test génère un **JSON brut** automatiquement à chaque exécution.
2. **Étape manuelle** — Un script générateur (`tests/helpers/*-report.cjs`) lit le JSON et produit un **rapport `.txt`** lisible.

```md
pnpm test              →  tests/reports/vitest-results.json     (auto)
pnpm test:report       →  tests/reports/vitest-report.txt       (lit le JSON ci-dessus)

pnpm test:e2e          →  tests/reports/playwright-results.json  (auto)
                          tests/reports/playwright/               (HTML auto)
pnpm test:e2e:report   →  tests/reports/playwright-report.txt    (lit le JSON ci-dessus)

pnpm a11y              →  tests/reports/pa11y-results.json       (auto)
                          tests/reports/pa11y-report.txt          (auto via orchestrateur)
                          .lighthouseci/ → tests/reports/lighthouse/ (copie auto)
pnpm a11y:report       →  tests/reports/lighthouse-report.txt    (lit les JSON LHCI)
```

### 3 scénarios d'utilisation

| Scénario | Commande | Ce qui se passe |
| :-- | :-- | :-- |
| **QA offline** (sans DB) | `pnpm qa:offline` | check → build → lint → test+coverage → génère vitest-report.txt |
| **QA complète** (avec DB) | `pnpm qa` | Tout qa:offline + e2e + e2e-report + a11y (pa11y + lighthouse) |
| **Re-lire un rapport existant** | `pnpm test:report` / `pnpm test:e2e:report` / `pnpm a11y:report` | Re-génère le `.txt` à partir du dernier JSON sans relancer les tests |

### Où atterrit chaque artifact

```md
tests/reports/
├── vitest-results.json          ← JSON auto (pnpm test)
├── vitest-report.txt            ← Texte (pnpm test:report)
├── coverage/
│   └── coverage-summary.json    ← JSON auto (pnpm test -- --coverage)
├── playwright-results.json      ← JSON auto (pnpm test:e2e)
├── playwright/                  ← HTML auto (pnpm test:e2e)
├── playwright-report.txt        ← Texte (pnpm test:e2e:report)
├── pa11y-results.json           ← JSON auto (pnpm a11y)
├── pa11y-report.txt             ← Texte auto (pnpm a11y)
└── lighthouse/                  ← Copie HTML+JSON (pnpm a11y)
    └── lighthouse-report.txt    ← Texte (pnpm a11y:report)
```

> **En local** : tout est gitignored, les rapports restent sur votre machine.
> **En CI** : les rapports sont uploadés comme **artifacts GitHub Actions** (rétention 7 jours) et résumés dans le job `ci-summary`.

---

## CI/CD — GitHub Actions

### Workflow `ci.yml` — 6 jobs

```md
┌─────────────────────┐
│   lint-and-check    │  ESLint + astro check + pnpm audit
└──────┬──────────────┘
       │
   ┌───┴───┐
   ▼       ▼
┌──────┐ ┌───────────┐
│ unit │ │ a11y-perf │  Pa11y + Lighthouse (parallèle)
│tests │ └───────────┘
└──┬───┘
   │
   ▼
┌──────┐
│ e2e  │  Playwright Chromium + Firefox + WebKit
│tests │
└──┬───┘
   │
   ▼
┌────────┐
│ deploy │  Build + artifact (main branch only)
└────────┘
       │
       ▼
┌────────────┐
│ ci-summary │  Résumé dans PR / commit
└────────────┘
```

### Workflow `codeql.yml` — SAST

- **Trigger** : push/PR main + cron lundi 06:00 UTC
- **Analyse** : JavaScript/TypeScript avec `security-extended`

### Dependabot

- **Fréquence** : hebdomadaire (lundi)
- **Groupes** : astro, auth, database, testing, tailwind
- **Limite** : 10 PRs max

---

## Arborescence des tests

```md
tests/
├── unit/                          # 48 fichiers — 656 tests
│   ├── admin-contact.test.ts      # updateContactInfo (10 : handler + Zod)
│   ├── admin-hours.test.ts        # updateOpeningHours (13 : handler + Zod)
│   ├── admin-navigation-items.test.ts  # CRUD navigation (11)
│   ├── admin-pages.test.ts        # CRUD pages + publish (14)
│   ├── admin-sections.test.ts     # CRUD sections + reorder (15)
│   ├── admin-site.test.ts         # upsert/update site settings (6)
│   ├── admin-social.test.ts       # CRUD social links (9)
│   ├── admin-theme.test.ts        # CRUD thèmes + activation (10)
│   ├── cache.test.ts              # Cache mémoire + stats + shutdown
│   ├── navigation-loader.test.ts  # getMenu / getMenusList / getMenuMeta (7)
│   ├── theme-tokens.test.ts       # OKLCH parser + CSS generation (33)
│   ├── ... (37 autres fichiers)
│
├── integration/                   # 11 fichiers — 85 tests
│   ├── auth.test.ts               # Sign-up/sign-in/sessions (22)
│   ├── auth-advanced.test.ts      # Ban/unban, rôles, password (10)
│   ├── auth-org.test.ts           # Organisations (10)
│   ├── audit.test.ts              # Insertion audit_log (6)
│   ├── middleware.test.ts         # Session injection (4)
│   ├── ... (5 autres fichiers)
│
├── e2e/                           # 3 fichiers — 34 specs ×3 browsers = 102
│   ├── app.spec.ts                # Homepage, i18n, security headers
│   ├── auth.spec.ts               # Sign-up/sign-in, guards, session
│   ├── cms-admin.spec.ts          # Admin pages (site, nav, theme)
│   ├── global-setup.ts            # Seed admin user
│   └── global-teardown.ts         # Cleanup
│
├── a11y/                          # Orchestration accessibilité
│   ├── run.cjs                    # Orchestrateur complet (build → audit → teardown)
│   ├── setup.ts                   # Seed users + cookies
│   ├── lhci-authed.cjs            # Lighthouse pages authentifiées
│   ├── lhci-rename.cjs            # Renommage rapports
│   └── lhci-report.cjs            # Générateur rapport LHCI
│
├── helpers/                       # Générateurs de rapports
│   ├── auth.ts                    # Helper auth partagé
│   ├── vitest-report.cjs          # JSON → texte Vitest
│   ├── playwright-report.cjs      # JSON → texte Playwright
│   └── lighthouse-report.cjs      # JSON → texte Lighthouse
│
└── reports/                       # ⚠️ Gitignored — artifacts générés
    ├── vitest-results.json
    ├── vitest-report.txt
    ├── coverage/
    ├── playwright-results.json
    ├── playwright/                # HTML report
    ├── playwright-report.txt
    ├── pa11y-results.json
    ├── pa11y-report.txt
    └── lighthouse/                # Copie des rapports LHCI
```

---

## Prochaines étapes

Voir **[gaps.md](gaps.md)** pour la liste des failles restantes par priorité.
