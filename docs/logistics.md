# Module logistique (`src/modules/logistics`)

Entrepôts, articles, stock par entrepôt (journal de mouvements) et expéditions (bons de livraison), multi-tenant, avec un lien facultatif vers un document du module ventes.

## Cycle de vie d'une expédition

`DRAFT → READY → SHIPPED → DELIVERED`

- Une expédition prête peut revenir en brouillon (`READY → DRAFT`). On peut l'annuler depuis `DRAFT` ou `READY`.
- Une expédition partie peut être retournée (`SHIPPED | DELIVERED → RETURNED`).
- Le **numéro de bon de livraison** est attribué au passage à `READY` via `core/numbering`. La clé est `logistics.shipment` et le schéma par défaut `BL-{YYYY}-{seq:5}`, sans trou et remis à zéro chaque année.
- Le stock **sort** au passage à `SHIPPED` (mouvement `shipment`) et **rentre** au retour (mouvement `return`). Un stock insuffisant bloque l'expédition (`InsufficientStockError`).
- Seul un brouillon est modifiable. Seuls un brouillon ou une expédition annulée peuvent être supprimés.

## Domaine (pur, `domain/`)

- `workflow.ts` : transitions, `nextStatuses`, effets sur le stock.
- `numbering.ts` : numérotation des BL.
- `shipment.ts` : validation des expéditions et entrepôts, `shipmentLabel`.
- `stock.ts` : types de mouvement `receipt`, `issue`, `adjustment`, `transfer_in`, `transfer_out`, `shipment`, `return`, et quantités signées.
- `errors.ts` : erreurs du domaine.

## Données

La migration `0033` crée les tables `logistics_warehouses`, `logistics_items`, `logistics_shipments`, `logistics_shipment_lines`, `logistics_stock_movements`, `logistics_shipment_revisions` et `logistics_shipment_locks`.

- Le niveau de stock est la somme des mouvements par entrepôt et par article. Il est lu dans `loaders/` uniquement, et les écritures passent par `services/`.
- Les codes d'entrepôt et les SKU sont normalisés en majuscules et uniques par tenant.

## Actions (`actions.logistics.*`)

- Expéditions : `create`, `update`, `updateTracking`, `transition`, `delete`, `lock`, `unlock`, `bulk` (annuler ou marquer livrées).
- Entrepôts : `createWarehouse`, `updateWarehouse`, `deleteWarehouse`.
- Articles : `createItem`, `updateItem`, `deleteItem`.
- Stock : `recordMovement`, `transfer`.

Les permissions `logistics:create | read | update | delete` sont vérifiées pour l'organisation de la fiche (tenant).

## Administration

- `/{lang}/admin/logistics` : liste des expéditions, avec recherche (intitulé, numéro, destinataire, suivi), filtre de statut, tris, vues enregistrées et actions groupées.
- `/{lang}/admin/logistics/new` et `/{lang}/admin/logistics/{id}/edit` : formulaire d'expédition (lignes dynamiques, brouillon uniquement).
- `/{lang}/admin/logistics/{id}` : fiche de l'expédition, avec les transitions autorisées, le numéro de BL, les lignes et le suivi transporteur.
- `/{lang}/admin/logistics/warehouses[/{id}]` et `/{lang}/admin/logistics/items[/{id}]` : entrepôts et articles.
- `/{lang}/admin/logistics/stock` : niveaux de stock, saisie de mouvement, transfert entre entrepôts et journal des mouvements.

Les traductions existent en fr, en, es et ar (`i18n/`), avec une interface RTL en arabe. Le script client est `client/init.ts` (formulaires et actions de fiche).

## Tests

- `tests/unit/logistics/*.test.ts`
- `tests/integration/logistics-module.test.ts`
- `tests/e2e/logistics-admin.spec.ts`
- `tests/e2e/a11y.spec.ts` (pages logistiques)
