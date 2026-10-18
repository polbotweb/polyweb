# Testing — Tests End-to-End (E2E)

> Retour à l'[index](index.md) · Voir aussi [setup](setup.md)

---

## Vue d'ensemble

| Fichier | Scope | Tests | Status |
| :-- | :-- | --: | :-- |
| `tests/e2e/app.spec.ts` | Homepage, i18n, guest guards, security headers | 14 | ✅ |
| `tests/e2e/auth.spec.ts` | Sign-up/in, dashboard, profile, pages publiques | 12 | ✅ |
| `tests/e2e/cms-admin.spec.ts` | Pages admin CMS (site, navigation, theme) | 8 | ✅ |
| **Total** | | **34** | **✅** |

### Infrastructure

| Fichier | Rôle |
| :-- | :-- |
| `tests/e2e/global-setup.ts` | Seed un user vérifié dans la DB avant les tests |
| `tests/e2e/global-teardown.ts` | Supprime le user seed après les tests |

### Prérequis

- **Astro build** : `pnpm build` doit avoir été fait avant de lancer les E2E
- **PostgreSQL** : base migrée avec un user seed vérifié
- **Playwright** : `npx playwright install --with-deps chromium firefox webkit`

### Seed User

```ts
// tests/e2e/global-setup.ts
SEED_EMAIL    = 'e2e-seed@test.com'
SEED_PASSWORD = 'E2eTest1234!'
SEED_NAME     = 'E2E Seed User'
```

Le `global-setup` :

1. Supprime le user précédent (cleanup)
2. Inscrit le user via `auth.api.signUpEmail()`
3. Force `emailVerified: true` et `role: 'admin'` en DB (SQL direct)

> Le seed user est **admin** pour permettre l'accès aux pages CMS dans `cms-admin.spec.ts`.

Le `global-teardown` :

1. Supprime les lignes `account`, `session`, `user` par email

---

## `app.spec.ts` — Homepage, i18n, Guest Guards

### Homepage & i18n (5 tests)

| # | Test | URL | Assertion |
| :-- | :-- | :-- | :-- |
| 1 | `homepage redirects to default locale /fr/` | `/` | `page.url()` termine par `/fr/` |
| 2 | `French page has lang="fr" and dir="ltr"` | `/fr/` | `<html lang="fr" dir="ltr">` |
| 3 | `English page has lang="en"` | `/en/` | `<html lang="en">` |
| 4 | `Arabic page has dir="rtl"` | `/ar/` | `<html dir="rtl">` |
| 5 | `navigation and footer are rendered` | `/fr/` | `<nav>` et `<footer>` visibles |

### Auth — Guest guards (5 tests)

| # | Test | URL | Assertion |
| :-- | :-- | :-- | :-- |
| 6 | `sign-in page renders the login form` | `/fr/auth/connexion/` | Formulaire avec input email visible |
| 7 | `sign-up page renders the registration form` | `/fr/auth/inscription/` | Formulaire avec input name visible |
| 8 | `dashboard redirects unauthenticated user to sign-in` | `/fr/auth/tableau-de-bord/` | Redirigé vers page de connexion |
| 9 | `profile redirects unauthenticated user to sign-in` | `/fr/auth/profil/` | Redirigé vers page de connexion |
| 10 | `admin redirects unauthenticated user to sign-in` | `/fr/admin/stats` | Redirigé vers page de connexion |

### Security headers (4 tests)

| # | Test | URL | Assertion |
| :-- | :-- | :-- | :-- |
| 11 | `responses include X-Content-Type-Options: nosniff` | `/fr/` | Header `x-content-type-options: nosniff` |
| 12 | `responses include X-Frame-Options: DENY` | `/fr/` | Header `x-frame-options: DENY` |
| 13 | `responses include Referrer-Policy` | `/fr/` | Header `referrer-policy: strict-origin-when-cross-origin` |
| 14 | `responses include Permissions-Policy` | `/fr/` | Header `permissions-policy` contient `camera=()` |

### Stratégie

- **Navigation pure** : aucune authentication, teste le HTML rendu
- **i18n complet** : vérifie `lang` et `dir` pour fr, en, ar
- **Guards** : les pages protégées redirigent vers `/auth/connexion/`
- **Security headers** : vérifie les 4 en-têtes de sécurité injectés par le middleware

---

## `auth.spec.ts` — Sign-up, Sign-in, Dashboard, Profile, Pages publiques

### Sign-up flow (2 tests)

| # | Test | Ce qu'il fait |
| :-- | :-- | :-- |
| 1 | `sign-up form submits and redirects to sign-in page` | Remplit le formulaire → submit → redirigé vers connexion |
| 2 | `sign-in form rejects unverified email` | Tente de se connecter avec un email non vérifié → erreur affichée |

### Authenticated flow (2 tests)

| # | Test | Ce qu'il fait |
| :-- | :-- | :-- |
| 3 | `verified user can sign in and reach dashboard` | Login du seed user → dashboard accessible |
| 4 | `authenticated user can access profile page` | Après login → page profil contient les infos user |

### Auth guards (3 tests)

| # | Test | Ce qu'il fait |
| :-- | :-- | :-- |
| 5 | `organisations page redirects to sign-in` | `/fr/organisations/` sans auth → redirigé |
| 6 | `verify-email page is accessible without auth` | `/fr/verification-email/` → accessible (pas de redirect) |
| 7 | `reset-password page is accessible without auth` | `/fr/reinitialiser-mot-de-passe/` → accessible |

### Public pages (5 tests)

| # | Test | Ce qu'il fait |
| :-- | :-- | :-- |
| 8 | `about page loads` | `/fr/a-propos/` → status 200, contenu visible |
| 9 | `contact page loads` | `/fr/contact/` → status 200, contenu visible |
| 10 | `legal page loads` | `/fr/mentions-legales/` → status 200, contenu visible |
| 11 | `forgot password page loads` | `/fr/mot-de-passe-oublie/` → accessible |
| 12 | `Spanish locale loads correctly` | `/es/` → `lang="es"`, contenu espagnol |

### Stratégie — auth.spec.ts

- **Seed user** : tests 3-4 utilisent le user vérifié du `global-setup`
- **Formulaire réel** : tests 1-2 remplissent et soumettent les vrais formulaires HTML
- **Locales multiples** : test 12 vérifie l'espagnol en plus du français
- **Pages publiques** : vérifie que about, contact, legal, forgot-password, verify-email, reset-password sont accessibles sans auth

---

## Commandes

```bash
# Lancer tous les E2E
pnpm test:e2e

# Lancer un seul fichier
npx playwright test tests/e2e/auth.spec.ts

# Mode debug (browser visible)
npx playwright test --headed

# Mode UI
npx playwright test --ui

# Voir le rapport HTML
npx playwright show-report tests/reports/playwright

# Générer le rapport texte (après exécution)
pnpm test:e2e:report
# → tests/reports/playwright-report.txt
```

### Rapports

| Fichier | Contenu |
| :-- | :-- |
| `tests/reports/playwright/` | Rapport HTML Playwright (généré automatiquement) |
| `tests/reports/playwright-results.json` | Résultats JSON bruts |
| `tests/reports/playwright-report.txt` | Rapport texte lisible (généré via `pnpm test:e2e:report`) |

---

## Résumé couverture E2E

```md
Pages testées :              15 URLs distinctes
Locales testées :            4 (fr, en, ar, es)
Auth guards :                6 redirections vérifiées
Formulaires :                2 (sign-up, sign-in)
Flow authentifié :           2 (dashboard, profil)
Pages publiques :            5
Pages admin CMS :            3 (site, navigation, theme)
Security headers :           4
Scénarios Playwright :       34
Navigateurs :                Chromium + Firefox + WebKit
Exécutions totales :         102
Fichiers :                   3 (+2 setup/teardown)
Temps d'exécution :          ~45–90 s
```

---

## `cms-admin.spec.ts` — Pages Admin CMS

### CMS Admin access (1 test)

| # | Test | Ce qu'il fait |
| :-- | :-- | :-- |
| 1 | `unauthenticated user is redirected from admin pages` | `/fr/admin/site` sans auth → redirigé vers connexion |

### CMS Site settings page (3 tests)

| # | Test | Ce qu'il fait |
| :-- | :-- | :-- |
| 2 | `site page loads successfully` | Login admin → `/fr/admin/site` → status 200 |
| 3 | `site page contains settings form` | Formulaire visible (inputs site name, description, etc.) |
| 4 | `site page has tabs` | Corps de la page contient du contenu |

### CMS Navigation page (2 tests)

| # | Test | Ce qu'il fait |
| :-- | :-- | :-- |
| 5 | `navigation page loads successfully` | Login admin → `/fr/admin/navigation` → status 200 |
| 6 | `navigation page contains form` | Formulaire de gestion de menu visible |

### CMS Theme page (2 tests)

| # | Test | Ce qu'il fait |
| :-- | :-- | :-- |
| 7 | `theme page loads successfully` | Login admin → `/fr/admin/theme` → status 200 |
| 8 | `theme page contains form` | Formulaire de personnalisation du thème visible |

### Stratégie — cms-admin.spec.ts

- **Sign-in avec retry** : le helper `signInAsAdmin()` tente 2 fois la connexion pour gérer les race conditions avec les workers parallèles
- **Admin seed** : le `global-setup` crée un user avec `role: 'admin'` — les tests n'ont pas besoin de promouvoir le user
- **Pages CMS non-traduites** : les routes admin utilisent des slugs anglais (`/fr/admin/site`, pas `/fr/admin/paramètres`)
