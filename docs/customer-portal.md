# Portail client (`/[lang]/account`)

Espace « Mon compte » du client connecté : **factures** (PDF / Factur-X, paiement), **commandes**
(statut, suivi et demande de retour), **réservations** (gestion, annulation) et **remboursements**.
Module : `src/modules/portal/`.

## Propriété des enregistrements

| Enregistrement | Colonne propriétaire |
| --- | --- |
| Factures / avoirs (`sales_documents`) | `customer_user_id` (FK `user`, `ON DELETE SET NULL`) |
| Réservations (`bookings`) | `customer_user_id` (FK `user`, `ON DELETE SET NULL`) |
| Commandes (`orders`) | `user_id` (existant) |
| Remboursements (`refunds`) | via la référence de paiement `<purpose>:<id>` d'un enregistrement possédé |

Migration : `0045_customer_portal_links.sql`.

Le rattachement se fait **uniquement vers un compte dont l'e-mail est VÉRIFIÉ**, comparaison
insensible à la casse (après `trim`). Un e-mail partagé par plusieurs comptes vérifiés n'est rattaché
à aucun. Un e-mail non vérifié ne donne **jamais** accès à rien.

- **À la création** :
  - document de vente créé/modifié par l'équipe : propriétaire = compte vérifié de `customerEmail`
    (recalculé si l'e-mail change) ;
  - réservation publique faite par un client connecté : propriétaire = ce compte ;
  - commande boutique : `orders.user_id` (déjà renseigné au checkout connecté).
- **À la vérification d'e-mail** (inscription ou changement d'adresse) : hook better-auth
  `emailVerification.afterEmailVerification` → `attachVerifiedRecords(userId)` rattache les
  enregistrements invités **sans propriétaire**. Idempotent ; ne réattribue jamais un enregistrement déjà possédé.
- **Existant** : `pnpm db:backfill-customer-links` (SQL ensembliste, idempotent).

Seuls les factures et avoirs **émis** sont visibles (jamais brouillons ni devis).

## Accès unitaire et IDOR

Les actions passent par des routes du portail qui vérifient la propriété **avant** de produire le
lien signé existant (`?t=`) du parcours concerné :

| Route | Effet |
| --- | --- |
| `GET /[lang]/account/invoices/{id}/pdf` | PDF Factur-X (limité à 20 / min) |
| `GET /[lang]/account/invoices/{id}/pay` | 303 → lien de paiement signé |
| `GET /[lang]/account/orders/{id}` | 303 → suivi de commande signé (retours) |
| `GET /[lang]/account/bookings/{id}` | 303 → gestion de réservation signée (annulation) |

Sans session : `401`. Identifiant d'un autre client : `404`, **identique** à un identifiant
inexistant (pas d'oracle d'existence, aucun jeton émis). Réponses `private, no-store` et `noindex`.

## Tests

- `tests/unit/portal-ownership.test.ts` : règles pures, chemins, i18n 4 locales.
- `tests/integration/portal.test.ts` : rattachement (création, vérification, backfill, non vérifié),
  listes limitées au compte, IDOR sur `owned*` et `resolvePortalTarget`.
- `tests/e2e/customer-portal.spec.ts` : page, 401 anonyme, 404 sur les identifiants d'autrui.
- `/[lang]/account` est audité par pa11y (AAA) et Lighthouse (compte seedé avec facture,
  commande et réservation — `tests/a11y/setup.ts`).
