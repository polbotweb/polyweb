# Module achats (`src/modules/purchasing`)

Fournisseurs, commandes fournisseur (bons de commande) et réceptions de marchandises (bons de réception), multi-tenant. Chaque réception crée des entrées de stock dans le module logistique.

## Cycle de vie d'une commande

`DRAFT → SENT → PARTIALLY_RECEIVED → RECEIVED → CLOSED`

- Une commande envoyée peut revenir en brouillon (`SENT → DRAFT`). On peut l'annuler depuis `DRAFT` ou `SENT`.
- Une commande partiellement reçue ou entièrement reçue peut être soldée (`CLOSED`).
- `PARTIALLY_RECEIVED` et `RECEIVED` sont posés **uniquement par une réception**. Ils ne sont jamais proposés comme transitions manuelles.
- Le **numéro de bon de commande** est attribué au passage `DRAFT → SENT` via `core/numbering`. La clé est `purchasing.order` et le schéma par défaut `BC-{YYYY}-{seq:5}`, sans trou et remis à zéro chaque année.
- Seul un brouillon est modifiable. Seuls un brouillon ou une commande annulée sans réception peuvent être supprimés.

## Réception de marchandises

- On peut réceptionner une commande `SENT` ou `PARTIALLY_RECEIVED`, avec une quantité par ligne (0 = non reçue) qui ne dépasse jamais le reliquat.
- Tout se fait dans une seule transaction :
  - verrouillage de la commande ;
  - attribution d'un numéro de bon de réception (clé `purchasing.receipt`, schéma `BR-{YYYY}-{seq:5}`) ;
  - un mouvement de stock `receipt` par ligne dans l'entrepôt de la commande (via `logisticsStockPort`) ;
  - mise à jour des quantités reçues et du statut ;
  - révision.

## Domaine (pur, `domain/`)

- `workflow.ts` : transitions, `nextStatuses`, statuts posés par réception.
- `numbering.ts` : numérotation des BC et des BR.
- `order.ts` : validation des commandes et des fournisseurs, `purchaseOrderLabel`.
- `receipt.ts` : reliquat (`outstanding`) et plan de réception.
- `errors.ts` : erreurs du domaine.

## Données

- La migration `0034` crée les tables `purchasing_suppliers`, `purchasing_orders`, `purchasing_order_lines`, `purchasing_receipts`, `purchasing_receipt_lines`, `purchasing_order_revisions` et `purchasing_order_locks`.
- La migration `0035` rend différées (`DEFERRABLE INITIALLY DEFERRED`) les clés étrangères entre tables `no action` (fournisseur, entrepôt, article, ligne, mouvement). Ainsi, la suppression en cascade d'une organisation ne dépend pas de l'ordre des triggers.
- Les montants sont stockés en unités mineures (`core/money`). Les codes fournisseurs sont normalisés en majuscules et uniques par tenant.
- Les lectures passent par `loaders/` et les écritures par `services/`.

## Actions (`actions.purchasing.*`)

- Commandes : `create`, `update`, `transition`, `receive`, `delete`, `lock`, `unlock`, `bulk` (annuler ou solder).
- Fournisseurs : `createSupplier`, `updateSupplier`, `deleteSupplier` (refusé si le fournisseur a des commandes).

Les permissions `purchasing:create | read | update | delete` sont vérifiées pour l'organisation de la fiche (tenant).

## Administration

- `/{lang}/admin/purchasing` : liste des commandes, avec recherche (intitulé, numéro, fournisseur), filtre de statut, tris, vues enregistrées et actions groupées.
- `/{lang}/admin/purchasing/new` et `/{lang}/admin/purchasing/{id}/edit` : formulaire de commande (lignes dynamiques, brouillon uniquement).
- `/{lang}/admin/purchasing/{id}` : fiche de la commande, avec les transitions, le numéro de BC, les lignes (commandé / reçu), le formulaire de réception et l'historique des réceptions.
- `/{lang}/admin/purchasing/suppliers[/{id}]` : fournisseurs.
- `/{lang}/admin/purchasing/receipts` : dernières réceptions.

Les traductions existent en fr, en, es et ar (`i18n/`), avec une interface RTL en arabe. Le script client est `client/init.ts` (formulaires et actions de fiche).

## Tests

- `tests/unit/purchasing/*.test.ts`
- `tests/integration/purchasing-module.test.ts`
- `tests/e2e/purchasing-admin.spec.ts`
- `tests/e2e/a11y.spec.ts` (pages achats)
