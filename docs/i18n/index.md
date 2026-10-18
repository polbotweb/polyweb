# Internationalisation (i18n)

> **Modules** : `src/i18n/config.ts`, `src/i18n/utils.ts`, `src/i18n/{locale}/`  
> **Stratégie** : Route-based prefix `[lang]/`, 4 locales, SSR uniquement

---

## Table des matières

1. [Configuration](#1-configuration)
2. [Locales supportées](#2-locales-supportées)
3. [Structure des traductions](#3-structure-des-traductions)
4. [Fonctions utilitaires](#4-fonctions-utilitaires)
5. [Routage i18n](#5-routage-i18n)
6. [Support RTL](#6-support-rtl)
7. [Ajouter une locale](#7-ajouter-une-locale)
8. [Ajouter des clés de traduction](#8-ajouter-des-clés-de-traduction)

---

## 1. Configuration

**Fichier** : `src/i18n/config.ts`

```typescript
export const LOCALES = ['fr', 'en', 'es', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';
export const RTL_LOCALES: Locale[] = ['ar'];
```

| Constante | Usage |
| :-- | :-- |
| `LOCALES` | Tuple readonly — liste exhaustive des locales |
| `Locale` | Type union : `'fr' \| 'en' \| 'es' \| 'ar'` |
| `DEFAULT_LOCALE` | Locale par défaut (`'fr'`) — utilisée quand le paramètre `[lang]` est invalide |
| `RTL_LOCALES` | Locales nécessitant `dir="rtl"` |
| `LOCALE_LABELS` | Labels d'affichage : `{ fr: 'Français', en: 'English', ... }` |

---

## 2. Locales supportées

| Code | Label | Direction | Statut |
| :-- | :-- | :-- | :-- |
| `fr` | Français | LTR | ✅ Par défaut |
| `en` | English | LTR | ✅ |
| `es` | Español | LTR | ✅ |
| `ar` | العربية | RTL | ✅ |

---

## 3. Structure des traductions

Chaque locale a son propre dossier avec des fichiers TypeScript typés :

```text
src/i18n/
├── config.ts              # Constantes, types, interfaces de traduction
├── utils.ts               # Fonctions utilitaires (loaders, URL, locale helpers)
├── fr/                    # Locale française (default)
│   ├── common.ts          # Navigation, footer, CTA, a11y, meta
│   ├── home.ts            # Page d'accueil (hero, logos, pillars, etc.)
│   ├── auth.ts            # Pages auth (sign-in, sign-up, dashboard, etc.)
│   ├── about.ts           # Page à propos
│   └── contact.ts         # Page contact
├── en/                    # Même structure
├── es/                    # Même structure
└── ar/                    # Même structure (RTL)
```

### Interfaces TypeScript

Les traductions sont typées via des interfaces définies dans `config.ts` :

| Interface | Fichier source | Contenu principal |
| :-- | :-- | :-- |
| `CommonTranslations` | `common.ts` | `meta`, `pageRoutes`, `nav`, `cta`, `footer`, `a11y` |
| `HomeTranslations` | `home.ts` | `hero`, `logos`, `pillars`, `features`, `faq` |
| `AuthTranslations` | `auth.ts` | `routes`, `signIn`, `signUp`, `dashboard`, `admin`, `org` |
| `AboutTranslations` | `about.ts` | `hero`, `mission`, `team`, `values` |

> **Note** : Le contenu légal (mentions, CGV, politique) est désormais géré via le CMS (tables `pages` + `page_sections`, template `legal`).
| `ContactTranslations` | `contact.ts` | `hero`, `form`, `info`, `map` |

---

## 4. Fonctions utilitaires

**Fichier** : `src/i18n/utils.ts`

### Loaders de traductions

| Fonction | Retour | Usage |
| :-- | :-- | :-- |
| `getCommonTranslations(locale)` | `Promise<CommonTranslations>` | Nav, footer, meta, routes |
| `getHomeTranslations(locale)` | `Promise<HomeTranslations>` | Page d'accueil |
| `getAuthTranslations(locale)` | `Promise<AuthTranslations>` | Pages auth + admin |
| `getAboutTranslations(locale)` | `Promise<AboutTranslations>` | Page à propos |
| `getContactTranslations(locale)` | `Promise<ContactTranslations>` | Page contact |

Chaque loader utilise un `import()` dynamique pour ne charger que la locale demandée.

### Génération d'URLs

| Fonction | Signature | Exemple |
| :-- | :-- | :-- |
| `getAuthUrl` | `(locale, pageId, authT) → string` | `getAuthUrl('fr', 'sign-in', authT)` → `/fr/auth/connexion` |
| `resolveAuthSlug` | `(slug, authT) → AuthPageId \| null` | `resolveAuthSlug('connexion', authT)` → `'sign-in'` |
| `getAdminUrl` | `(locale, subpage?) → string` | `getAdminUrl('fr', 'users')` → `/fr/auth/admin/users` |
| `getOrgUrl` | `(locale, orgSlug, subpage?) → string` | `getOrgUrl('fr', 'acme', 'members')` → `/fr/organizations/acme/members` |
| `getPageUrl` | `(locale, pageId, commonT) → string` | `getPageUrl('en', 'about', commonT)` → `/en/about` |
| `resolvePageSlug` | `(slug, commonT) → PageId \| null` | `resolvePageSlug('a-propos', commonT)` → `'about'` |

### Helpers locale

| Fonction | Signature | Détail |
| :-- | :-- | :-- |
| `toLocale(value)` | `(string \| undefined) → Locale` | Convertit en Locale valide, fallback sur `DEFAULT_LOCALE` |
| `isValidLocale(value)` | `(string \| undefined) → boolean` | Type guard |
| `isRTL(locale)` | `(Locale) → boolean` | `true` si `locale` est dans `RTL_LOCALES` |
| `getDirection(locale)` | `(Locale) → 'rtl' \| 'ltr'` | Pour l'attribut `dir` du `<html>` |

---

## 5. Routage i18n

### Structure des routes

Toutes les pages utilisent le paramètre dynamique `[lang]` :

```text
src/pages/
├── index.astro                    # Redirect → /fr/ (DEFAULT_LOCALE)
└── [lang]/
    ├── index.astro                # Page d'accueil
    ├── [page].astro               # Pages dynamiques CMS (about, contact, etc.)
    ├── auth/
    │   ├── [auth].astro           # Pages auth (sign-in, sign-up, etc.)
    │   ├── admin/
    │   │   └── [...admin].astro   # Pages admin CMS
    │   └── ...
    └── organizations/
        └── [slug]/                # Pages organisation
```

### Résolution de route

1. Le paramètre `[lang]` est validé via `toLocale(Astro.params.lang)`
2. Si la locale est invalide → fallback sur `fr` (DEFAULT_LOCALE)
3. Les slugs de pages sont traduits via `pageRoutes` dans `CommonTranslations`
4. Les slugs auth sont traduits via `routes` dans `AuthTranslations`

---

## 6. Support RTL

L'arabe (`ar`) est une locale RTL. Le support est géré à plusieurs niveaux :

| Niveau | Mécanisme |
| :-- | :-- |
| HTML | `<html lang="ar" dir="rtl">` via `getDirection(locale)` |
| CSS | Tailwind CSS `rtl:` variant pour les styles directionnels |
| Layout | BaseLayout.astro définit `lang` et `dir` dynamiquement |

---

## 7. Ajouter une locale

1. **Ajouter à la config** :

   ```typescript
   // src/i18n/config.ts
   export const LOCALES = ['fr', 'en', 'es', 'ar', 'de'] as const;
   // Si RTL : ajouter à RTL_LOCALES
   ```

2. **Créer le dossier de traductions** :

   ```text
   src/i18n/de/
   ├── common.ts
   ├── home.ts
   ├── auth.ts
   ├── about.ts
   └── contact.ts
   ```

3. **Copier une locale existante** (ex: `en/`) et traduire toutes les clés.

4. **Ajouter le label** :

   ```typescript
   export const LOCALE_LABELS: Record<Locale, string> = {
     // ...existing
     de: 'Deutsch',
   };
   ```

5. **Vérifier** : lancer `pnpm test` — les tests i18n vérifient automatiquement que toutes les locales ont les clés requises.

---

## 8. Ajouter des clés de traduction

1. **Mettre à jour l'interface** dans `config.ts` (ajouter la nouvelle clé au type)
2. **Ajouter la valeur** dans **chaque** fichier locale (`fr/`, `en/`, `es/`, `ar/`)
3. **Lancer les tests** : `pnpm test` — `i18n-translations.test.ts` et `cms-i18n.test.ts` vérifient la complétude

---

## Tests

| Fichier | Tests | Couverture |
| :-- | :-- | :-- |
| `tests/unit/i18n-utils.test.ts` | 6 | `toLocale`, `isRTL`, `getDirection` |
| `tests/unit/i18n-urls.test.ts` | 22 | URL generation × 4 locales, slug resolution |
| `tests/unit/i18n-translations.test.ts` | 16 | 4 loaders × 4 locales (clés requises) |
| `tests/unit/cms-i18n.test.ts` | 16 | Clés CMS × 4 locales |
