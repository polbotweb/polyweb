# API publique v1

API REST JSON exposée sous `/api/v1`, alimentée par un **registre** : chaque module
déclare ses ressources et ses événements dans `src/modules/<module>/api/public-api.ts`
et les enregistre via `registerModuleApi(...)`. Routes, contrôle des scopes,
pagination, idempotence et spécification OpenAPI sont générés à partir du registre.

## Ressources et scopes

| Module | Ressource | Lecture | Écriture | Filtres | Opérations |
|---|---|---|---|---|---|
| sales | `quotes`, `invoices`, `credit-notes` | `sales:read` | — | status, number, customerEmail, issuedFrom, issuedTo | liste, fiche |
| shop | `orders` | `shop:read` | — | status, number, email | liste, fiche |
| shop | `products` | `shop:read` | — | status, sku | liste, fiche |
| logistics | `stock-levels` | `stock:read` | — | sku, variantId | liste, fiche |
| crm | `contacts` | `crm:read` | `crm:write` | q, email, companyId | + création, modification |
| crm | `companies` | `crm:read` | `crm:write` | q, country | + création, modification |
| bookings | `bookings` | `bookings:read` | `bookings:write` | status, resourceId, from, to | + création, action `cancel` |
| subscriptions | `subscriptions` | `subscriptions:read` | — | status, planId, customerEmail | liste, fiche |

`<module>:write` implique la lecture. Les scopes « cœur » (`content:read`, `content:write`, …)
restent inchangés.

## Clés d'API

- Créées dans **Admin → Plateforme → Clés d'API** (`/[lang]/admin/platform/api-tokens`),
  avec scopes, expiration facultative et limite de débit facultative.
- Le secret n'est affiché qu'une fois ; seul son **hash** est stocké.
- Révocation immédiate ; une clé expirée ou révoquée répond `401`.
- Envoi : `Authorization: Bearer <clé>`.
- **Tenant** : la clé est liée à un site ; les données lues/écrites sont toujours celles
  du site (et de son organisation) de la clé, quel que soit l'hôte appelé. Une fiche
  d'un autre tenant répond `404` (jamais `403`, pour ne pas révéler son existence).

### Limite de débit

Fenêtre glissante de 60 s : `rateLimitPerMinute` de la clé, sinon
`API_RATE_LIMIT_TOKEN` (600 par défaut) ; requêtes anonymes : `API_RATE_LIMIT_ANON` (120).
Chaque réponse porte les en-têtes `RateLimit-*` ; au-delà, `429` avec `Retry-After`.

## Pagination

Pagination par curseur opaque : `?limit=` (1 à 100, défaut 20) et `?cursor=` issu de
`meta.nextCursor`. Un curseur invalide ou une limite hors bornes répond `400`.

## Idempotency-Key

Les créations et actions acceptent `Idempotency-Key` (1 à 255 caractères ASCII visibles),
mémorisée 24 h par clé d'API :

- même clé + même requête → réponse d'origine rejouée, en-tête `Idempotent-Replayed: true` ;
- même clé + requête différente → `400` ;
- requête encore en cours avec cette clé → `409`.

## OpenAPI

`GET /api/v1/openapi.json` décrit toutes les ressources du registre, leurs filtres,
schémas et scopes requis.

## Webhooks

Événements disponibles :

| Module | Événements |
|---|---|
| sales | `invoice.issued`, `invoice.paid`, `credit_note.issued` |
| shop | `order.paid`, `order.shipped`, `order.refunded` |
| logistics | `stock.low` |
| crm | `contact.created`, `contact.updated` |
| bookings | `booking.created`, `booking.canceled` |
| subscriptions | `subscription.created`, `subscription.updated`, `subscription.canceled` |

Chaque livraison est un `POST` JSON signé :
`Polyweb-Signature: t=<unix>,v1=<hex>` avec `v1 = HMAC-SHA256(secret, "<t>.<corps>")`,
plus `Polyweb-Event`, `Polyweb-Delivery` et `Polyweb-Timestamp`. Les échecs sont
réessayés avec backoff exponentiel jusqu'à `webhooks.maxAttempts`, puis marqués `dead`.

### Outbox (exactly-once à l'enfilage)

Les événements sont écrits dans la table `event_outbox` **dans la même transaction**
que la modification métier : un rollback n'émet rien, un commit enfile exactement un
événement. Après COMMIT, l'événement est diffusé sur le bus (webhooks, plugins) sous
un verrou court (`lockedUntil`, 60 s) ; il n'est marqué diffusé que si tous les abonnés
ont réussi, sinon un cron de reprise le rediffuse. Les livraisons elles-mêmes
sont « au moins une fois » : dédupliquez côté récepteur via `Polyweb-Delivery`.

### `stock.low`

Émis quand le **stock physique total** (somme des quantités en main de tous les
entrepôts, hors réservations) d'un article franchit à la baisse son seuil
`lowStockThreshold` (atteint ou passe en dessous). Pas de nouvel événement tant que
le stock ne remonte pas au-dessus du seuil. Seuil vide = pas d'alerte.

## Ajouter une ressource à un module

`pnpm module:new` génère un stub `api/public-api.ts` (lecteur en lecture seule).
Complétez-le puis ajoutez `registerModuleApi(<module>Api)` au bootstrap du module.
Les services qui importent `astro:actions` doivent être chargés via `import()` paresseux.
