# Middleware

> **Fichier** : `src/middleware.ts`  
> **Type** : Astro `defineMiddleware` — exécuté à chaque requête SSR

---

## Rôle

Le middleware Astro intercepte **toutes les requêtes** avant qu'elles n'atteignent les pages ou endpoints API. Il gère trois responsabilités :

1. **Injection de session** — authentifie l'utilisateur et peuple `Astro.locals`
2. **Protection SVG** — empêche l'exécution XSS via les fichiers SVG uploadés
3. **En-têtes de sécurité** — ajoute les headers de protection sur toutes les réponses

---

## 1. Injection de session

```typescript
let timedOut = false;
let isAuthed: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;

try {
  isAuthed = await Promise.race([
    auth.api.getSession({ headers: context.request.headers }),
    new Promise<null>((resolve) => setTimeout(() => { timedOut = true; resolve(null); }, 5000)),
  ]);
} catch (err) {
  console.error('[middleware] Session check failed:', err);
  isAuthed = null;
}

if (timedOut) {
  console.warn('[middleware] Session check timed out (5s) — returning 503');
  return new Response('Service temporarily unavailable', { status: 503, headers: { 'Retry-After': '5' } });
}

if (isAuthed) {
  context.locals.user = isAuthed.user;
  context.locals.session = isAuthed.session;
} else {
  context.locals.user = null;
  context.locals.session = null;
}
```

### Comportement

| Cas | `locals.user` | `locals.session` | Réponse |
| :-- | :-- | :-- | :-- |
| Cookie valide, DB réactive | `User` ✅ | `Session` ✅ | Page normale |
| Pas de cookie / invalid | `null` | `null` | Page normale |
| DB lente (> 5s) | — | — | **503** + `Retry-After: 5` |
| Erreur session (exception) | `null` | `null` | Page normale |

### Timeout (5 secondes)

Le `Promise.race` avec un timeout de 5 secondes protège contre les DB lentes. Si la requête de session dépasse 5s :

- La requête est interrompue et renvoie **HTTP 503** (`Service temporarily unavailable`)
- Le header `Retry-After: 5` indique au client de réessayer
- Un `console.warn` est émis pour le monitoring

Si `getSession()` lève une exception (DB crash, etc.), l'erreur est catchée et l'utilisateur est traité comme non-authentifié (la page continue normalement).

### Types `App.Locals`

Définis dans `src/env.d.ts` :

```typescript
declare namespace App {
  interface Locals {
    user: import('better-auth').User | null;
    session: import('better-auth').Session | null;
  }
}
```

---

## 2. Protection SVG

```typescript
const lowerPath = url.pathname.toLowerCase();
if (lowerPath.startsWith('/uploads/') && (lowerPath.endsWith('.svg') || lowerPath.endsWith('.svgz'))) {
  response.headers.set('Content-Disposition', 'attachment');
  response.headers.set('Content-Type', 'image/svg+xml');
}
```

Les fichiers SVG peuvent contenir du JavaScript. Sans protection, un SVG uploadé malicieusement pourrait exécuter du code dans le contexte du domaine.

| Protection | Effet |
| :-- | :-- |
| `Content-Disposition: attachment` | Force le téléchargement au lieu du rendu inline |
| `Content-Type: image/svg+xml` | Empêche l'interprétation comme HTML |
| Case-insensitive | `.svg`, `.svgz`, `.SVG` — tous interceptés via `toLowerCase()` |

---

## 3. En-têtes de sécurité

Appliqués à **toutes les réponses** :

| En-tête | Valeur |
| :-- | :-- |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `X-XSS-Protection` | `0` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |

---

## Flux complet d'une requête

```text
HTTP Request
  │
  ▼
Middleware onRequest()
  │
  ├─ 1) auth.api.getSession() → locals.user / locals.session
  │     └─ Timeout 5s → 503 (Retry-After: 5)
  │     └─ Exception → locals = null, continue
  │
  ├─ 2) next() → Page / API endpoint traite la requête
  │
  ├─ 3) SVG/SVGZ check → Content-Disposition si /uploads/*.svg|.svgz
  │
  ├─ 4) Security headers → ajout sur la Response
  │
  ▼
HTTP Response
```

---

## Tests

Le middleware est testé dans `tests/integration/middleware.test.ts` (4 tests) :

- Injection session avec headers valides
- `null` locals sans cookie
- En-têtes de sécurité présents sur la réponse
- SVG Content-Disposition
