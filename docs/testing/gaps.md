# Testing — Couverture & Gaps restants

> Retour à l'[index](index.md)

---

## Historique des gaps (tous résolus)

Lors de l'audit initial, 14 gaps prioritaires (P2) et 5 gaps secondaires (P3) avaient été identifiés. **Tous les gaps P2 et P3 ont été fermés** au cours des phases d'implémentation.

### P0 — Bloquants (0 restants)

Tous les bloquants (rate-limit, i18n, extract-ip) étaient déjà couverts dans les phases précédentes.

### P1 — Fonctionnels (0 restants)

Tous les fonctionnels (auth, audit, admin, export) étaient déjà couverts dans les phases précédentes.

### P2 — Résolus ✅

| ID | Gap initial | Solution | Fichier |
| :-- | :-- | :-- | :-- |
| P2-1 | Upload unit manquant | 10 tests upload (processUpload, deleteUpload, constantes, sécurité) | `tests/unit/upload.test.ts` |
| P2-2 | Mask-utils non testé | 10 tests (maskUrl, dbNameFromUrl, maskApiKey) | `tests/unit/mask-utils.test.ts` |
| P2-3 | i18n-urls manquant | 22 tests (getAuthUrl, resolveAuthSlug, getPageUrl ×4 locales) | `tests/unit/i18n-urls.test.ts` |
| P2-4 | i18n-translations manquant | 16 tests (4 loaders ×4 locales, clés structurelles) | `tests/unit/i18n-translations.test.ts` |
| P2-5 | send-email non testé | 5 tests mock (routage 3 providers, from config) | `tests/unit/send-email.test.ts` |
| P2-6 | schema-validation manquant | 12 tests (8 table exports + 4 colonnes critiques) | `tests/unit/schema-validation.test.ts` |
| P2-7 | CLI utils non testé | 12 tests (formatPgError 10 codes + ANSI 2) | `tests/unit/cli-utils.test.ts` |
| P2-8 | auth-advanced manquant | 10 tests (password reset/change, email verif, updateUser) | `tests/integration/auth-advanced.test.ts` |
| P2-9 | auth-org manquant | 5 tests (updateOrg, invite, accept, remove, delete) | `tests/integration/auth-org.test.ts` |
| P2-10 | middleware non testé | 4 tests (getSession avec 4 types de headers) | `tests/integration/middleware.test.ts` |
| P2-11 | db-health non testé | 3 tests (checkConnection, singleton, raw query) | `tests/integration/db-health.test.ts` |
| P2-12 | E2E password-forgot page | Test ajouté : `forgot password page loads` | `tests/e2e/auth.spec.ts` |
| P2-13 | E2E Spanish locale | Test ajouté : `Spanish locale loads correctly` | `tests/e2e/auth.spec.ts` |
| P2-14 | E2E profile access | Test ajouté : `authenticated user can access profile page` | `tests/e2e/auth.spec.ts` |
| P2-15 | `/api/contact` intégration | 14 tests : validation Zod, sanitisation XSS (DOMPurify), rate limiting (IP + global), template email, audit log DB, pipeline complète | `tests/integration/contact-api.test.ts` |

### P3 — Résolus ✅

| ID | Gap initial | Résolution |
| :-- | :-- | :-- |
| P3-1 | Auth sign-up/in/out flow | Couvert dans `auth-flow.test.ts` (5 tests) |
| P3-2 | Audit hooks deeply | Couvert dans `audit.test.ts` (4 tests hooks) |
| P3-3 | RGPD deletion flow | Couvert dans `auth.test.ts` (2 tests deletion) |
| P3-4 | Impersonation admin | Couvert dans `auth.test.ts` (2 tests impersonation) |
| P3-5 | Organization CRUD | Couvert dans `auth-org.test.ts` (5 tests) |

---

## Gaps restants (faible priorité)

Les gaps ci-dessous sont de **priorité très basse** (P4) — ils ne bloquent rien et ne représentent pas de risque fonctionnel.

| ID | Module | Description | Raison de non-implémentation |
| :-- | :-- | :-- | :-- |
| P4-1 | `authClient` | Client-side auth (React/Astro islands) | Nécessiterait JSDOM + mocking complet du runtime navigateur |
| P4-2 | `getPgClient` | Ouverture/fermeture de la connexion PG brute | Déjà couvert indirectement par `db-health.test.ts` |
| P4-3 | `shutdownDb` | Cleanup de la connexion au shutdown | Fonction triviale, couverte par le teardown global |
| P4-4 | Components UI | Tests de rendu des composants Astro/Starwind | Nécessiterait Container API (expérimental dans Astro) |
| P4-5 | Admin CMS CRUD | Tests E2E de soumission réelle des formulaires admin | Couvert structurellement (page loads + form visible) ; le CRUD complet nécessiterait des fixtures seed complexes |
| P4-6 | Actions admin | Tests d'intégration des 19 Astro Actions admin | Partiellement couvert par `cms-admin.test.ts` (14 tests) + `admin-helpers.test.ts` (5 tests). Restant : test des handlers individuels via harness Astro Actions |

---

## Corrections E2E & Lighthouse CI

### E2E — Stabilité WebKit & flaky tests (résolu)

- **WebKit skips supprimés** : les 10 `test.skip(browserName === 'webkit')` ont été retirés de `auth.spec.ts` (3), `cms-admin.spec.ts` (3×2 hooks) et `app.spec.ts`.
- **Pattern robuste** : tous les sign-in E2E utilisent désormais `Promise.all([page.waitForURL(...), button.click()])` + `page.waitForLoadState('networkidle')` pour éviter les race conditions.
- **`waitUntil: 'networkidle'`** ajouté à tous les `page.goto()` dans les 3 fichiers de specs E2E.
- **Timeouts portés à 30 s** sur les navigations critiques (sign-up, sign-in, guards).

### Lighthouse CI — NO_NAVSTART (résolu)

- Ajout des flags Chrome `--disable-extensions --disable-component-extensions-with-background-pages` dans `lighthouserc.cjs`.
- Ajout de `maxWaitForLoad: 45000` dans les settings Lighthouse pour laisser le temps au navigateur de terminer la navigation.

---

## Gaps accessibilité & performance (Pa11y + Lighthouse)

> Identifiés lors de la mise en place des audits a11y/perf. **Tous les gaps a11y ont été résolus** — Pa11y passe maintenant 52/52 URLs en WCAG AAA.

### Pa11y-ci — WCAG AAA ✅

**Score** : 52/52 URLs configurées (100 %)

> Dont 12 URLs CMS admin (site, navigation, theme × 4 locales) ajoutées récemment.

Tous les problèmes d'accessibilité ont été corrigés :

| Type d'erreur | Résolution |
| :-- | :-- |
| Contraste insuffisant (AAA) | Nouveau token `text-primary-deep` (dark gold ≥5:1 sur blanc), suppression opacité `/70` sur `text-muted-foreground` |
| Labels de formulaire manquants | Ajout `for="..."` + `id="..."` sur les inputs auth + profile |
| `aria-prohibited-attr` | Ajout `role="img"` sur le conteneur des étoiles (`SideCarouselCards.astro`) |
| `image-redundant-alt` | `alt=""` sur le logo (`Brand.astro`) |
| `target-size` | Dots du carousel agrandis de 8px à 24px (`HeroSection.astro`) |
| `heading-order` (profil) | `<h3>` → `<h2>` pour export data + delete account |
| CLS (legal) | Logo `w-auto` → `w-30` pour réserver l'espace |

### Lighthouse CI — Performance

**Scores a11y/best-practices/SEO** : ✅ ≥ 0.9 partout (52 URLs auditées : 28 publiques + 8 authentifiées + 16 admin CMS)

**Scores performance** : ≤7 URLs < 0.9

| URL | Score | Cause probable |
| :-- | :-- | :-- |
| `ar--من-نحن` | 79 | LCP 2.4s, SI 2.6s |
| `es--home` | 83 | LCP 1.9s, SI 2.8s |
| `en--about` | 86 | LCP 1.4s, SI 4.0s |
| `fr--home` | 87 | LCP 1.2s, SI 4.0s |
| `en--home` | 88 | LCP 1.3s, SI 3.6s |
| `ar--الشروط-القانونية` | 89 | CLS 0.223 |
| `es--acerca-de` | 89 | SI 3.2s |

> Toutes les autres pages (auth, contact, dashboard, profile, admin) sont à **98-100** en performance.

### Améliorations restantes (performance)

| Priorité | Action | Impact |
| :-- | :-- | :-- |
| P3 | Optimiser les images homepage (WebP, lazy loading) | Améliore les scores perf |
| P3 | Réduire le bundle JS initial | Améliore les scores perf |
| P4 | Optimiser les fonts RTL pour l'arabe | Améliore le score perf arabe |

---

## Couverture par module

| Module | Fonctions | Testées | Couverture |
| :-- | :-- | :-- | :-- |
| `src/lib/rate-limit.ts` | 1 | 1 | 100 % |
| `src/lib/audit.ts` | 2 | 2 | 100 % |
| `src/lib/auth.ts` | ~15 API methods | ~15 | ~100 % |
| `src/i18n/utils.ts` | ~12 | ~12 | ~100 % |
| `src/database/env.ts` | 3 | 3 | 100 % |
| `src/database/schemas.ts` | 8 tables | 8 | 100 % |
| `src/database/commands/_utils.ts` | 3 | 3 | 100 % |
| `src/smtp/send.ts` | 1 | 1 | 100 % |
| `src/smtp/env.ts` | 3 | 3 | 100 % |
| `src/media/upload.ts` | 1 | 1 | 100 % |
| `src/media/delete.ts` | 1 | 1 | 100 % |
| `src/media/types.ts` | 3 constants | 3 | 100 % |
| `src/pages/api/export-data.ts` | 1 | 1 | 100 % |
| `src/database/schemas/` (CMS) | 7 tables | 7 | 100 % |
| `src/database/data/` (CMS seeds) | 6 fichiers seed | 6 | 100 % |
| `src/database/loaders/` (CMS) | ~6 fonctions | ~3 (E2E) | ~50 % |
| `src/actions/admin/` | 19 actions | 0 (structurel E2E) | 0 % |
| `src/i18n/` (CMS keys) | 4 locales × clés CMS | 4 | 100 % |
| `src/lib/audit.ts` (CMS actions) | 12 AuditAction | 12 | 100 % |
| **Estimation globale** | | | **~90 %** |

> Note : l'estimation de 90 % exclut les composants UI (Astro/React), le code client-side, et les Astro Actions admin (pas de harness de test standard).
