# Boutique — panier, commande et paiement

Tunnel de vente du module `shop` : panier (invité ou connecté), commande avec TVA calculée par
[`tax`](tax.md), réservation de stock [`logistics`](logistics.md), numérotation sans trou
([`core/numbering`](numbering.md)) et paiement en ligne via [`core/payments`](payments.md)
(Stripe en production, fournisseur **mock** signé en développement, tests et CI).
Code : `src/modules/shop/{domain,services,public,admin,payments.ts}`, Effect v4 de bout en bout.

## Parcours public (`/<locale>/shop/…`, 4 locales dont l'arabe RTL)

| Page | Rôle |
| --- | --- |
| `/<locale>/shop/<slug>` | Fiche produit : formulaire « Ajouter au panier » par variante disponible (quantité 1–99). |
| `/<locale>/shop/cart` | Panier : modifier, retirer, stock disponible, total TTC, accès à la commande. |
| `/<locale>/shop/checkout` | Coordonnées, adresse, pays (UE + liste hors UE), mode de livraison, récapitulatif HT / TVA par taux / TTC (« recalculer » sans valider). |
| `/<locale>/shop/order/<id>?t=<jeton>` | Suivi invité (lien signé) : récapitulatif, paiement ou nouvelle tentative. |

Toutes les pages du tunnel sont **privées** : `Cache-Control: private, no-store`,
`X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: same-origin` sur le suivi (le jeton ne fuit
pas vers des tiers). Formulaires POST sans JavaScript (redirection 303 après succès), erreurs
reliées aux champs (`aria-invalid`, `aria-describedby`, résumé d'erreurs), honeypot et horodatage
anti-robots, limitation par IP. Les routes `cart`, `checkout` et `order` masquent d'éventuels
produits portant ces slugs.

## Panier

- `carts` / `cart_lines` (unicité variante par panier, quantité 1–99 par contrainte `CHECK`).
- **Invité** : cookie `pw_cart = <cartId>.<HMAC>` (`httpOnly`, `SameSite=Lax`, `Secure` en HTTPS,
  30 jours). Clé dérivée de `POLYWEB_SIGNING_SECRET` (défaut `BETTER_AUTH_SECRET`) ; un
  identifiant seul ne donne accès à rien, comparaison en temps constant.
- **Connecté** : panier rattaché à l'utilisateur ; le panier invité est fusionné à la connexion
  (quantités cumulées, plafonnées) puis le cookie est effacé.
- Une seule devise par panier ; variantes non publiées ou d'un autre tenant refusées
  (`InvalidCartError` typée : `quantity`, `currency`, `lines`).
- Les paniers invités inactifs sont purgés par le balayage (cron `payments-expire`).

## Commande

`createOrder` (une transaction, panier verrouillé `FOR UPDATE`) :

1. validation de la saisie (`InvalidCheckoutError` liste **tous** les champs fautifs, rien n'est écrit) ;
2. prix **relus côté serveur** (jamais ceux du navigateur) ; prix catalogue **TTC** au taux du
   pays vendeur, TVA ventilée par taux via le module `tax` (`domestic`, `eu-oss` si
   `SHOP_OSS_REGISTERED=true`, `export` hors UE : le client paie le hors taxe) ;
3. réservation Logistics par variante suivie (`logistics_stock_reservations`, statut `active`,
   échéance = échéance de paiement) ; stock insuffisant → `OutOfStockError` (SKU), rien n'est écrit ;
4. numéro **sans trou** `CMD-AAAA-NNNNNN` (remise annuelle, attribué dans la transaction) ;
5. lignes figées (`order_lines`, désignation, PU TTC, total, catégorie fiscale ; le port est une
   ligne `SHIPPING`) et panier vidé.

Contraintes en base : montants positifs, `gross = net + tax`, `line_total = unit_price × quantity`,
numéro unique par tenant. Le paiement est ensuite demandé à `core/payments` (`purpose = shop-order`,
fenêtre de 60 min) ; un échec du fournisseur annule la commande et libère le stock.

### Cycle de vie (`core/workflow`)

```
PENDING_PAYMENT → PAID → SHIPPED → DELIVERED
       │            └──────┴──────────┴──→ REFUNDED
       ├→ CANCELLED (administration)
       └→ EXPIRED → PAID (paiement tardif acquis)
```

Réactions `core/payments` (`src/modules/shop/payments.ts`, idempotentes) :

- **payé** → `PAID`, réservations consommées en mouvements de sortie Logistics (référence = numéro
  de commande). Un manque (réservation échue puis stock vendu) n'échoue jamais : il est consigné
  dans `stock_shortage` (SKU logistiques) et journalisé ;
- paiement reçu sur une commande **annulée** : `paid_at` enregistré, anomalie journalisée
  (remboursement à traiter) ;
- **expiré** → `EXPIRED`, réservations libérées ; **remboursé** → `REFUNDED` (retour en stock :
  décision manuelle dans Logistics) ;
- **balayage** : commandes échues sans webhook (marge 10 min), réservations échues, paniers abandonnés.

Les variantes sans article Logistics lié ne sont pas suivies en stock. Les réservations actives
sont déduites du disponible pour les autres sorties Logistics.

## Administration (`/<locale>/admin/orders`)

- Permissions RBAC du namespace `shop` : `read` (liste, fiche), `update` (transitions, liens),
  revérifiée à chaque POST ; données isolées par tenant.
- Liste filtrable (statut, recherche numéro / e-mail / nom, période du … au …), paginée.
- Fiche : lignes, totaux, paiement, transitions autorisées (expédier, livrer, annuler une commande
  non payée), lien facultatif vers un document Sales (facture) et une expédition Logistics.
- Audit : `SHOP_ORDER_CREATE`, `SHOP_ORDER_TRANSITION`, `SHOP_ORDER_LINK`.
- Retours clients (RMA) d'une commande livrée : voir [shop-returns.md](shop-returns.md).

> ⚠️ Une expédition Logistics liée et passée `SHIPPED` **avec des lignes** décrémenterait le stock
> une seconde fois (déjà sorti au paiement) : lier une expédition sans lignes, ou ne pas en lier.

## Configuration (environnement uniquement)

| Variable | Rôle |
| --- | --- |
| `SHOP_SELLER_COUNTRY` | Pays du vendeur (ISO 3166-1 alpha-2, défaut `FR`) : taux de TVA des prix TTC, zone de port. |
| `SHOP_OSS_REGISTERED` | `true` : ventes UE B2C au taux du pays de livraison (guichet OSS). |
| `SHOP_CHECKOUT_RATE_LIMIT` | Commandes par IP et par 10 min (défaut 10, borné à [1, 1000]). |
| `PAYMENTS_*`, `STRIPE_*` | Voir [payments.md](payments.md). Sans paiement activé, la commande reste en attente. |

Grille de port fixe (centimes) : standard 590 / 1290 / 2490, express 1290 / 2490 / 4990
(national / UE / monde), retrait 0 (national uniquement). Le catalogue public est celui de la plateforme.

## Tests

- `tests/unit/shop/checkout-domain.test.ts` : jetons, tarification, validation, workflow.
- `tests/integration/shop-checkout.test.ts` (base réelle, fournisseur **mock**, jamais Stripe) :
  panier, fusion, commande, TVA, numérotation, réservations, webhooks payé / expiré / tardif,
  annulation, balayage, filtres admin, export hors UE.
- `tests/a11y/setup.ts` seed un produit, un panier invité et une commande : fiche, panier,
  commande, suivi et administration des commandes sont audités par pa11y (WCAG 2.1 AAA) et
  Lighthouse (lot `shop` sans `is-crawlable`, pages volontairement `noindex`). Le cookie panier et
  le jeton de suivi sont caviardés des rapports versionnés.
