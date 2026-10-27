# Boutique — retours clients (RMA)

Retour d'articles d'une commande **livrée** : demande du client depuis la page de suivi (lien
signé, sans compte ni JavaScript), traitement par l'administration (validation, réception,
inspection), remise en stock dans [Logistics](logistics.md) et remboursement par
[`core/refunds`](refunds.md). Aucun appel réel au fournisseur de paiement en test ou en CI
(fournisseur mock).

## Modèle

- `order_returns` : un retour par demande (`number` numéroté par [`core/numbering`](numbering.md),
  clé `shop.return`, schéma par défaut `RMA-{YYYY}-{seq:5}` remis à zéro chaque année),
  `order_id`, `organization_id` (nul pour le catalogue plateforme), motif, note client, note
  admin, devise, statut, auteurs et horodatages (validation, réception, inspection),
  `refund_id`, nombre de tentatives de remboursement.
- `order_return_lines` : lignes demandées (`quantity`), acceptées (`accepted`) et remises en
  stock (`restocked`), état constaté (`resellable` | `damaged`). Contrainte SQL :
  `restocked ≤ accepted ≤ quantity`.
- Migration : `0042_shop_returns.sql`.

## Cycle de vie (`src/modules/shop/domain/returns.ts`, `core/workflow`)

```
REQUESTED → APPROVED → RECEIVED → INSPECTED → REFUNDED
          ↘ REJECTED            ↘ CLOSED (rien d'accepté : aucun remboursement)
REQUESTED | APPROVED → CANCELLED
```

- Motifs : `defective`, `damaged`, `wrong_item`, `not_as_described`, `no_longer_needed`, `other`.
- **Pas de double retour** : les quantités déjà engagées par un retour non refusé ni annulé
  (`OPEN_RETURN_STATUSES`) sont déduites du retournable, calculé sous verrou de la commande ;
  deux demandes concurrentes ne dépassent jamais la quantité commandée.
- Contrôle de la demande (`checkReturnRequest`) : lignes connues et distinctes, quantités
  entières dans le retournable, 50 lignes au plus, note ≤ 1000 caractères.
- **Inspection** : quantités acceptées et remises en stock par ligne ; les quantités revendables
  entrent en stock par un mouvement Logistics `return` (grand livre, référence `RET-<commande>`).
- **Remboursement** : somme des quantités acceptées × prix TTC unitaire figé sur la ligne (port
  exclu), via `requestRefund` (motif `return`, clé d'idempotence `rma:<id>:<tentative>`). Un refus
  du fournisseur laisse le retour `INSPECTED` ; une nouvelle tentative utilise une nouvelle clé.
  Le passage à `REFUNDED` (`markReturnRefunded`) suit le même chemin en appel synchrone et par
  webhook (`src/modules/shop/refunds.ts`).

## Parcours client

Page de suivi `/{lang}/shop/order/{id}?t=…` (`OrderReturns.astro`) : retours existants et, si la
commande est livrée et qu'il reste du retournable, formulaire (quantité par ligne, motif, note).
`requestOrderReturn` (`src/modules/shop/public/flow.ts`) : lien vérifié, plafond de **5 demandes
par quart d'heure et par commande**, saisie refusée sans création (`invalid`), commande non
livrée (`notEligible`), audit `SHOP_RETURN_REQUEST`. Redirection PRG vers `&returned=<numéro>`.

## Administration

- `/{lang}/admin/returns` : liste paginée (25), filtre par statut, recherche par numéro de
  retour, de commande ou e-mail. Permission `shop:read`.
- `/{lang}/admin/returns/{id}` : fiche (lignes, notes, remboursement) et actions selon le statut
  (valider, refuser avec note, annuler, réceptionner, inspecter, rembourser). Les actions exigent
  `shop:update` ; le remboursement exige en plus `payment:refund`. Chaque action est auditée
  (`SHOP_RETURN_*`) et suit le modèle POST → redirection `?done=<clé>`.
- La fiche commande (`/{lang}/admin/orders/{id}`) liste ses retours.
- Cloisonnement : toutes les lectures et écritures sont filtrées par tenant.

## Limites connues

- Pas de délai de rétractation calculé (aucune date de livraison enregistrée).
- Une commande sans paiement en ligne ne peut pas être remboursée par un retour (notice
  `noPayment`) ; le remboursement se fait alors hors plateforme.

## Tests

- Unitaires : `tests/unit/shop/returns-domain.test.ts` (workflow, retournable, contrôle, montant).
- Intégration : `tests/integration/shop-returns.test.ts` (plafond, concurrence, workflow,
  remise en stock, remboursement idempotent, reprise après échec, webhook, tenants) et
  `tests/integration/shop-returns-public.test.ts` (parcours public).
- Accessibilité / Lighthouse : commande livrée avec un retour seedée par `tests/a11y/setup.ts`
  (page de suivi, liste et fiche admin des retours, fiche commande).
