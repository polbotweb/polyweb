# Actions & API Endpoints

> **Fichiers** : `src/actions/` (Astro Actions), `src/pages/api/` (API Routes)  
> **Pattern** : Astro 6 `defineAction()` + API Routes classiques

---

## Table des matières

1. [Architecture](#1-architecture)
2. [Astro Actions (admin CMS)](#2-astro-actions-admin-cms)
3. [API Endpoints](#3-api-endpoints)
4. [Helpers partagés](#4-helpers-partagés)
5. [Ajouter une action](#5-ajouter-une-action)

---

## 1. Architecture

```text
src/
├── actions/
│   ├── index.ts           # Export centralisé → server { ... }
│   └── admin/
│       ├── _helpers.ts    # assertAdmin, adminRateLimit, auditAdmin
│       ├── site.ts        # updateSiteSettings
│       ├── social.ts      # CRUD liens sociaux + reorder
│       ├── contact.ts     # updateContactInfo
│       ├── hours.ts       # updateOpeningHours
│       ├── menus.ts       # CRUD menus navigation
│       ├── navigation.ts  # CRUD items navigation + reorder
│       ├── pages.ts       # CRUD pages + publish
│       ├── sections.ts    # CRUD sections + reorder
│       └── theme.ts       # CRUD thèmes
└── pages/api/
    ├── auth/[...all].ts   # Handler better-auth (catch-all)
    ├── health.ts           # GET — health check (DB connectivity)
    ├── contact.ts          # POST — formulaire de contact public
    ├── upload.ts           # POST — upload fichier
    └── export-data.ts      # GET — export données RGPD
```

---

## 2. Astro Actions (admin CMS)

Toutes les actions admin utilisent `defineAction()` d'Astro 6 avec validation Zod et protection CSRF implicite.

### Liste complète (25 actions)

| Module | Actions | Fichier |
| :-- | :-- | :-- |
| **Site** | `updateSiteSettings` | `admin/site.ts` |
| **Social** | `createSocialLink`, `updateSocialLink`, `deleteSocialLink`, `reorderSocialLinks` | `admin/social.ts` |
| **Contact** | `updateContactInfo` | `admin/contact.ts` |
| **Horaires** | `updateOpeningHours` | `admin/hours.ts` |
| **Menus** | `createNavigationMenu`, `updateNavigationMenu`, `deleteNavigationMenu` | `admin/menus.ts` |
| **Navigation** | `createNavigationItem`, `updateNavigationItem`, `deleteNavigationItem`, `reorderNavigationItems` | `admin/navigation.ts` |
| **Pages** | `createPage`, `updatePage`, `deletePage`, `publishPage` | `admin/pages.ts` |
| **Sections** | `createSection`, `updateSection`, `deleteSection`, `reorderSections` | `admin/sections.ts` |
| **Thème** | `createTheme`, `updateTheme`, `deleteTheme` | `admin/theme.ts` |

### Pattern standard

Chaque action suit le même pattern :

```typescript
export const createNavigationItem = defineAction({
  input: z.object({ /* schema Zod */ }),
  handler: async (input, context) => {
    // 1. Auth + rôle admin
    const user = assertAdmin(context);

    // 2. Rate limit
    adminRateLimit(context, user.id, "nav");

    // 3. Logique métier (Drizzle)
    const db = getDrizzle();
    const [created] = await db.insert(table).values(input).returning();

    // 4. Audit
    auditAdmin(context, user.id, 'NAVIGATION_ITEM_CREATE', {
      resource: 'navigation_item',
      resourceId: created.id,
    });

    // 5. Invalidation cache
    invalidateCache("nav:");

    return created;
  },
});
```

### Validation des URLs

Les champs URL dans les actions sont validés avec restriction de protocole :

| Champ | Protocoles autorisés |
| :-- | :-- |
| Navigation `url` | `http://`, `https://`, `/`, `#`, `mailto:` |
| Site `logoLight/logoDark/favicon/ogImage` | `http://`, `https://`, `/` |
| Contact `mapUrl` | `http://`, `https://` (via `z.url()` + refine) |

---

## 3. API Endpoints

### `POST /api/auth/[...all]`

Handler catch-all better-auth. Gère tous les endpoints d'authentification (sign-in, sign-up, session, etc.).

```typescript
export const ALL: APIRoute = async (ctx) => auth.handler(ctx.request);
```

### `POST /api/upload`

Upload de fichier avec validation complète.

| Étape | Détail |
| :-- | :-- |
| Auth | Session requise |
| Rate limit | 10 req/60s par IP |
| Validation | Type MIME (magic bytes), taille ≤2 MB, fichier non vide |
| Cleanup | Suppression ancien fichier via `oldUrl` (restreint au type) |
| Audit | `FILE_UPLOAD` loggé |
| Retour | `{ url: "/uploads/images/..." }` (201) |

### `GET /api/export-data`

Export RGPD des données utilisateur au format JSON.

| Étape | Détail |
| :-- | :-- |
| Auth | Session requise |
| Rate limit | 5 req/60s par userId |
| Données | user, accounts, sessions, memberships, invitations, audit logs (max 10 000 entrées) |
| Retour | JSON avec `Content-Disposition: attachment` |

### `GET /api/health`

Health check — vérifie la connectivité à la base de données PostgreSQL.

| Étape | Détail |
| :-- | :-- |
| Auth | Aucune (endpoint public) |
| Réponse 200 | `{ status: "ok", db: { ok: true, latencyMs: N } }` |
| Réponse 503 | `{ status: "degraded"\|"error", db: { ok: false } }` |
| Cache | `Cache-Control: no-store` |

### `POST /api/contact`

Soumission du formulaire de contact public. Envoie un email au destinataire configuré via SMTP.

| Étape | Détail |
| :-- | :-- |
| Auth | Aucune (endpoint public) |
| Rate limit | 3 req/5min par IP |
| Validation | Zod schema (firstName, lastName, email, phone, reason, message, urgent, locale) |
| Sanitization | `sanitizeHtml()` sur les champs texte |
| Template | `contact-form` (voir `src/smtp/templates/contact-form.ts`) |
| Audit | `CONTACT_FORM_SUBMIT` loggé |
| Retour | `{ success: true }` (200) |

### `GET /sitemap-cms.xml`

Sitemap XML dynamique des pages CMS. Génère les URLs pour chaque locale (homepage + pages publiées).

| Étape | Détail |
| :-- | :-- |
| Auth | Aucune (endpoint public) |
| Données | `getPagesList()` par locale (4 locales) |
| Retour | XML `sitemap/0.9` |

---

## 4. Helpers partagés

**Fichier** : `src/actions/admin/_helpers.ts`

### `assertAdmin(context): User`

Vérifie que l'utilisateur est connecté et a le rôle `admin`. Lève une `ActionError` sinon :

- `UNAUTHORIZED` si non connecté
- `FORBIDDEN` si non admin

### `adminRateLimit(context, userId, scope, opts?)`

Applique un rate limit par userId et scope. Lève `TOO_MANY_REQUESTS` si dépassé.

| Paramètre | Défaut |
| :-- | :-- |
| `window` | 60s |
| `max` | 30 |
| `scope` | Nom du domaine (`nav`, `site`, `pages`, etc.) |

### `auditAdmin(context, userId, action, opts?)`

Enregistre un événement d'audit de manière non-bloquante (`void`). Extrait automatiquement l'IP et le User-Agent des headers de la requête.

### Helpers admin data — `src/lib/auth-data.ts`

Fonctions de lecture pour les pages admin (SSR loaders). Chaque fonction vérifie la session et le rôle `admin` avant d'accéder aux données.

| Fonction | Description |
| :-- | :-- |
| `fetchAdminUsers(headers, opts?)` | Liste paginée des utilisateurs (via better-auth API) |
| `fetchAdminOrgs(headers, opts?)` | Liste paginée des organisations |
| `fetchAdminAuditLogs(headers, page?, perPage?)` | Journal d'audit paginé (JOIN user pour noms) |
| `fetchAdminStats(headers)` | Stats dashboard : totalUsers, totalOrgs, recentSignups |
| `fetchOrgData(headers, orgSlug)` | Données complètes d'une organisation (avec vérification membership) |

---

## 5. Ajouter une action

1. **Créer le fichier** dans `src/actions/admin/` (ou ajouter à un fichier existant)

2. **Définir le schema Zod** avec validation stricte :

   ```typescript
   const input = z.object({
     name: z.string().min(1).max(200),
     url: z.string().max(500)
       .refine((v) => !v || /^(https?:\/\/|\/)/.test(v), "URL invalide")
       .nullable().optional(),
   });
   ```

3. **Implémenter le handler** avec le pattern standard (assertAdmin → rate limit → DB → audit → cache invalidation)

4. **Exporter** dans `src/actions/index.ts` :

   ```typescript
   import { myAction } from './admin/myModule';
   export const server = {
     // ...existing
     myAction,
   };
   ```

5. **Ajouter l'AuditAction** dans `src/lib/audit.ts` si nécessaire

6. **Tester** : ajouter des tests dans `tests/integration/cms-admin.test.ts`
