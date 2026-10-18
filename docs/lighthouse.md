# Lighthouse CI — Performance & Qualité

Audits automatisés Lighthouse sur les 4 locales (fr, en, es, ar) avec des gates ≥ 0.9 sur performance, accessibilité, bonnes pratiques et SEO.

## Architecture

```text
├── lighthouserc.cjs                   # Config principale — pages publiques (28 URLs)
├── .a11y-cookies.json                 # Cookies de session (généré, gitignored)
├── .lighthouseci/                     # Rapports HTML + JSON (généré, gitignored)
└── tests/a11y/
    ├── setup.ts                       # Seed users + export cookies
    ├── run.cjs                        # Orchestrateur tout-en-un
    ├── lhci-authed.cjs                # Config dynamique — pages authentifiées/admin
    ├── lhci-rename.cjs                # Renomme rapports timestamp → noms lisibles
    └── lhci-report.cjs                # Analyse des rapports (scores + CWV + contrast)
```

## Configuration

### `lighthouserc.cjs` — Config principale

| Paramètre | Valeur | Rôle |
| :-- | :-- | :-- |
| `collect.url` | 28 URLs publiques | Toutes les pages sans auth (4 locales × 7 pages) |
| `collect.numberOfRuns` | 1 | Une seule exécution par URL (suffisant en CI) |
| `collect.settings.preset` | `desktop` | Simule un desktop (pas mobile) |
| `collect.settings.chromeFlags` | `--no-sandbox --disable-setuid-sandbox` | Requis en CI (conteneur Docker) |
| `collect.settings.chromePath` | Auto-détecté | Chromium de Playwright (via `findChrome()`) |
| `assert.assertions` | ≥ 0.9 sur 4 catégories | Échoue si un score descend sous 90% |
| `upload.target` | `temporary-public-storage` | Lien public dans les logs CI |

### Gates (seuils d'erreur)

```javascript
assertions: {
  'categories:performance':    ['error', { minScore: 0.9 }],
  'categories:accessibility':  ['error', { minScore: 0.9 }],
  'categories:best-practices': ['error', { minScore: 0.9 }],
  'categories:seo':            ['error', { minScore: 0.9 }],
}
```

### Détection Chrome

La fonction `findChrome()` cherche Chromium dans cet ordre :

1. `process.env.CHROMIUM_PATH` (variable d'environnement)
2. Chromium installé par Playwright (`npx playwright install --dry-run`)
3. Fallback : laisse Lighthouse utiliser Chrome système

Cela évite d'installer Chrome séparément — on réutilise celui de Playwright.

## 3 batches d'exécution

LHCI ne supporte pas les headers par URL dans la config. Les pages authentifiées sont donc exécutées dans des batches séparés avec un fichier config temporaire.

| Batch | URLs | Cookie | Config | Script |
| :-- | --: | :-- | :-- | :-- |
| Public | 28 | Aucun | `lighthouserc.cjs` | `lhci autorun` |
| Authenticated | 8 | Session user | `.lighthouseci-authed.json` (temp) | `lhci-authed.cjs` |
| Admin | 16 | Session admin | `.lighthouseci-admin.json` (temp) | `lhci-authed.cjs` |

### `lhci-authed.cjs` — Pages authentifiées

Le script :

1. Importe `lighthouserc.cjs` pour récupérer `_authedUrls`, `_adminUrls`, `_userCookie`, `_adminCookie`
2. Génère un fichier JSON temporaire (`.lighthouseci-authed.json` ou `.lighthouseci-admin.json`) avec `extraHeaders: { Cookie: … }`
3. Exécute `npx lhci autorun --config <fichier-temp>`
4. Supprime le fichier temporaire (dans le `finally`)

> Pourquoi des fichiers temporaires ? Sur Windows, les flags CLI avec du JSON entre guillemets simples (`--collect.settings.extraHeaders='{"Cookie":"…"}'`) échouent. L'écriture d'un fichier config est universelle.

## URLs auditées

### Pages publiques (28 URLs)

| Locale | Homepage | About | Contact | Legal | Sign-in | Sign-up | Forgot |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| `fr` | `/fr/` | `/fr/a-propos` | `/fr/contact` | `/fr/mentions-legales` | `/fr/auth/connexion` | `/fr/auth/inscription` | `/fr/auth/mot-de-passe-oublie` |
| `en` | `/en/` | `/en/about` | `/en/contact` | `/en/legal-notice` | `/en/auth/sign-in` | `/en/auth/sign-up` | `/en/auth/forgot-password` |
| `es` | `/es/` | `/es/acerca-de` | `/es/contacto` | `/es/aviso-legal` | `/es/auth/iniciar-sesion` | `/es/auth/registro` | `/es/auth/contrasena-olvidada` |
| `ar` | `/ar/` | `/ar/من-نحن` | `/ar/اتصل-بنا` | `/ar/الشروط-القانونية` | `/ar/auth/تسجيل-الدخول` | `/ar/auth/انشاء-حساب` | `/ar/auth/نسيت-كلمة-المرور` |

### Pages authentifiées (8 URLs)

| Locale | Dashboard | Profile |
| :-- | :-- | :-- |
| `fr` | `/fr/auth/tableau-de-bord` | `/fr/auth/profil` |
| `en` | `/en/auth/dashboard` | `/en/auth/profile` |
| `es` | `/es/auth/panel` | `/es/auth/perfil` |
| `ar` | `/ar/auth/لوحة-التحكم` | `/ar/auth/الملف-الشخصي` |

### Pages admin (16 URLs)

| Locale | Admin |
| :-- | :-- |
| `fr` | `/fr/admin/stats`, `/fr/admin/site`, `/fr/admin/navigation`, `/fr/admin/theme` |
| `en` | `/en/admin/stats`, `/en/admin/site`, `/en/admin/navigation`, `/en/admin/theme` |
| `es` | `/es/admin/stats`, `/es/admin/site`, `/es/admin/navigation`, `/es/admin/theme` |
| `ar` | `/ar/admin/stats`, `/ar/admin/site`, `/ar/admin/navigation`, `/ar/admin/theme` |

## Rapports

### Emplacement

Les rapports sont générés dans `.lighthouseci/` (gitignored). Chaque URL produit :

- Un fichier **JSON** (données brutes Lighthouse)
- Un fichier **HTML** (rapport visuel ouvrable dans le navigateur)

### Renommage (`lhci-rename.cjs`)

Par défaut, LHCI nomme les fichiers `lhr-{timestamp}.html`. Le script de renommage les convertit en noms lisibles :

| Avant | Après |
| :-- | :-- |
| `lhr-1773479276175.html` | `fr--home.html` |
| `lhr-1773479290123.html` | `en--auth--sign-in.html` |
| `lhr-1773479490151.html` | `ar--من-نحن.html` |
| `lhr-1773479510987.html` | `ar--auth--تسجيل-الدخول.html` |

Le script :

1. Lit chaque `lhr-*.json` pour extraire `requestedUrl`
2. Convertit l'URL en nom de fichier (`/fr/` → `fr--home`, `/en/about` → `en--about`)
3. Décode les caractères percent-encoded (les slugs arabes restent en arabe)
4. Supprime les caractères non autorisés dans les noms de fichiers Windows
5. Renomme à la fois le `.json` et le `.html`

## Commandes

```bash
# Tout-en-un (build + serveur + audits + rename + teardown)
pnpm a11y                         # Pa11y + Lighthouse
pnpm a11y:lighthouse-only         # Lighthouse seulement

# Commandes individuelles (serveur requis sur localhost:4321)
pnpm a11y:setup                   # Seed users + export cookies
pnpm a11y:lighthouse              # Pages publiques (28 URLs)
pnpm a11y:lighthouse:authed       # Pages authentifiées + admin (24 URLs)
pnpm a11y:lighthouse:rename       # Renommer les rapports
pnpm a11y:teardown                # Cleanup users + cookies

# Analyse des rapports
pnpm a11y:lighthouse:report            # Scores + Core Web Vitals par page
pnpm a11y:lighthouse:report:contrast   # Idem + détails color-contrast
```

### Prérequis pour les commandes individuelles

1. **Serveur** en cours sur `localhost:4321` (`pnpm build && pnpm preview`)
2. **Chromium** installé (`npx playwright install chromium`)
3. **Base de données** migrée (`pnpm db:migrate`)
4. **Setup** exécuté (`pnpm a11y:setup`) avant les audits

> L'orchestrateur `pnpm a11y` gère automatiquement tous ces prérequis.

## Authentification

Le fichier `.a11y-cookies.json` est créé par `pnpm a11y:setup` et contient :

```json
{
  "userCookie": "better-auth.session_token=…",
  "adminCookie": "better-auth.session_token=…"
}
```

### Processus de seed (`tests/a11y/setup.ts`)

| Étape | Détail |
| :-- | :-- |
| 1 | Supprime les users précédents (idempotent) |
| 2 | Inscription via `auth.api.signUpEmail()` |
| 3 | Force `emailVerified: true` en DB |
| 4 | Connexion HTTP `POST /api/auth/sign-in/email` avec header `Origin` (CSRF) |
| 5 | Extraction du cookie `Set-Cookie` |
| 6 | Promotion admin via `UPDATE user SET role = 'admin'` |
| 7 | Re-authentication admin pour un cookie avec le rôle à jour |
| 8 | Écriture `.a11y-cookies.json` |

### Users seed

| User | Email | Rôle |
| :-- | :-- | :-- |
| `SEED_USER` | `a11y-seed@test.com` | `user` |
| `SEED_ADMIN` | `a11y-admin@test.com` | `admin` |

## CI — Job `a11y-perf`

Le job `a11y-perf` dans `.github/workflows/ci.yml` exécute les audits Lighthouse automatiquement :

1. Dépend uniquement de `lint-and-check` (tourne en parallèle avec unit + e2e)
2. Build + démarre le serveur preview
3. Seed users + Pa11y + Lighthouse (3 batches) + rename
4. Teardown (toujours exécuté)
5. Upload des rapports `.lighthouseci/` comme artifact GitHub (7 jours)

Voir `docs/testing/ci.md` pour le détail complet.

## Résultats actuels (32 pages)

| Catégorie | Résultat |
| :-- | :-- |
| **Accessibility** | ✅ **32/32 = 100/100** |
| **Best Practices** | ✅ **32/32 = 100/100** |
| **SEO** | ✅ **32/32 = 100/100** |
| **Performance** | ⚠️ **25/32 ≥ 90** |

7 pages sous le seuil perf : homepages (LCP/SI sur images hero), about (LCP image), pages légales (CLS logo). Voir `docs/testing/gaps.md` pour le plan.

## Dépendances

| Package | Version | Rôle |
| :-- | :-- | :-- |
| `@lhci/cli` | ^0.15.1 | CLI Lighthouse CI (`lhci autorun`) |
| `wait-on` | ^9 | Attente du serveur avant audits |
| `pa11y-ci` | ^4.1 | Audits Pa11y (fichier séparé, même setup) |
| `sharp` | ^0.34.5 | Optimisation des images (requis en production) |

## Patch chrome-launcher (Windows)

Sur Windows avec Node 25+, `chrome-launcher@1.2.1` crash lors du nettoyage du répertoire temporaire Chrome (`EPERM` sur `rmSync`). Le scan Lighthouse se termine normalement mais le processus exit avec code 1.

**Correctif** : un script `postinstall` (`scripts/patch-chrome-launcher.cjs`) wrappe le `destroyTmp()` dans un try/catch :

```bash
pnpm run postinstall  # appliqué automatiquement après pnpm install
```

Le script modifie `node_modules/chrome-launcher/dist/chrome-launcher.js` pour ignorer les erreurs `EPERM` lors de la suppression du répertoire temporaire.

> Ce patch n'affecte pas les résultats d'audit — seul le cleanup post-exécution est concerné.
