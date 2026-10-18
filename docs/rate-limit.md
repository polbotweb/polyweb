# Rate Limiting

> **Fichier** : `src/lib/rate-limit.ts`  
> **Tests** : `tests/unit/rate-limit.test.ts` (7 tests)

---

## Objectif

Rate limiter in-memory à fenêtre glissante pour les endpoints non-auth (admin actions, uploads, exports). Complémentaire au rate limiter built-in de better-auth qui protège les endpoints d'authentification.

---

## API

### `checkRateLimit(key, opts): RateLimitResult`

```typescript
import { checkRateLimit } from '@/lib/rate-limit';

const rl = checkRateLimit(`upload:${ip}`, { window: 60, max: 10 });
if (!rl.allowed) {
  // HTTP 429 avec Retry-After
  const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
}
```

### Paramètres

| Paramètre | Type | Description |
| :-- | :-- | :-- |
| `key` | `string` | Identifiant unique — typiquement `{scope}:{userId}` ou `{scope}:{ip}` |
| `opts.window` | `number` | Durée de la fenêtre en **secondes** |
| `opts.max` | `number` | Nombre max de requêtes dans la fenêtre |

### Retour (`RateLimitResult`)

| Champ | Type | Description |
| :-- | :-- | :-- |
| `allowed` | `boolean` | `true` si la requête est autorisée |
| `remaining` | `number` | Nombre de requêtes restantes dans la fenêtre |
| `resetAt` | `number` | Timestamp (ms) de réinitialisation de la fenêtre |

---

## Utilisation dans le projet

### Double couche de protection

| Couche | Scope | Endpoints | Implémentation |
| :-- | :-- | :-- | :-- |
| **better-auth** | Auth | `/sign-in`, `/sign-up`, `/sign-out`, etc. | 100 req/60s global, 3/10s pour `/sign-in/email` |
| **Custom** | Non-auth | Admin CMS, uploads, exports | `checkRateLimit()` in-memory |

### Limites configurées

| Endpoint | Clé | Window | Max | Fichier |
| :-- | :-- | --: | --: | :-- |
| `POST /api/upload` | `upload:{ip}` | 60s | 10 | `src/pages/api/upload.ts` |
| `GET /api/export-data` | `export:{userId}` | 60s | 5 | `src/pages/api/export-data.ts` |
| Admin actions (toutes) | `admin-{scope}:{userId}` | 60s | 30 | `src/actions/admin/_helpers.ts` |

### Scopes admin

Le `scope` dans `adminRateLimit()` est différencié par domaine pour éviter qu'une action CMS ne bloque une autre :

```typescript
adminRateLimit(context, user.id, "nav");   // clé: admin-nav:{userId}
adminRateLimit(context, user.id, "site");  // clé: admin-site:{userId}
adminRateLimit(context, user.id, "pages"); // clé: admin-pages:{userId}
```

---

## Architecture interne

```typescript
const store = new Map<string, { count: number; resetAt: number }>();
```

- **Store** : `Map` en mémoire process-local
- **Fenêtre** : sliding window — première requête crée l'entrée, les suivantes incrémentent
- **Cleanup** : `setInterval` toutes les 5 minutes supprime les entrées expirées
- **unref()** : le timer de cleanup ne bloque pas l'arrêt du process Node

---

## Limitation : déploiement multi-instance

⚠️ Le store est **process-local**. En déploiement multi-instance (load balancer), chaque nœud a son propre compteur, ce qui multiplie effectivement la limite par le nombre d'instances.

### Migration Redis

Pour le scaling, remplacer le `Map` par un compteur Redis :

```typescript
// Exemple avec ioredis
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

export async function checkRateLimit(key: string, opts: RateLimitOptions) {
  const count = await redis.incr(`rl:${key}`);
  if (count === 1) await redis.expire(`rl:${key}`, opts.window);
  return {
    allowed: count <= opts.max,
    remaining: Math.max(0, opts.max - count),
    resetAt: Date.now() + opts.window * 1000,
  };
}
```

---

## Tests

`tests/unit/rate-limit.test.ts` — 7 tests :

- Autorise les requêtes sous le seuil
- Bloque au-delà du max
- Reset après expiration de la fenêtre
- Clés indépendantes (pas de cross-contamination)
- Retourne `remaining` correct
- `resetAt` est dans le futur
- Requêtes successives décrémentent `remaining`
