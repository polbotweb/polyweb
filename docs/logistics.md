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
- `stock.ts` : types de mouvement `receipt`, `issue`, `adjustment`, `transfer_in`, `transfer_out`, `shipment`, `return`, quantités signées et origines (`MOVEMENT_SOURCES`).
- `inventory.ts` : saisie des comptages, états d'inventaire, calcul des écarts (`countAdjustments`).
- `ledger.ts` : filtres du grand livre (parse/validation des paramètres d'URL, pagination).
- `errors.ts` : erreurs du domaine.

## Données

La migration `0033` crée les tables `logistics_warehouses`, `logistics_items`, `logistics_shipments`, `logistics_shipment_lines`, `logistics_stock_movements`, `logistics_shipment_revisions` et `logistics_shipment_locks`.

- Le niveau de stock est la somme des mouvements par entrepôt et par article. Il est lu dans `loaders/` uniquement, et les écritures passent par `services/`.
- Les codes d'entrepôt et les SKU sont normalisés en majuscules et uniques par tenant.
- La migration `0043` ajoute la colonne `source` aux mouvements, ainsi que `inventory_count_id` et les tables `logistics_inventory_counts` / `logistics_inventory_count_lines`.

## Grand livre des mouvements

Chaque mouvement de stock porte son **origine** (`source`), son auteur (`created_by`) et son horodatage. Le grand livre est en ajout seul : aucune écriture ne modifie ou ne supprime un mouvement existant, une correction passe par un nouveau mouvement.

| Origine | Écrit par |
|---|---|
| `manual` | saisie de mouvement en back-office (`recordMovement`) |
| `transfer` | transfert entre entrepôts (`transfer`, paire `transfer_out` / `transfer_in`) |
| `shipment` | expédition partie ou retournée |
| `inventory` | ajustement posté à la validation d'un inventaire |
| `purchase` | réception d'achat (module achats) |
| `order` | sortie de stock d'une commande boutique |
| `return` | retour client (RMA) |

**Reprise des mouvements existants (migration `0043`)**, déterministe, dans cet ordre : lié à une expédition → `shipment` ; `transfer_in`/`transfer_out` → `transfer` ; lié à une ligne de réception d'achat → `purchase` ; type `return` → `return` ; `issue` sans auteur → `order` ; sinon `manual`.

> Cas limite connu : une sortie manuelle (`issue`) dont l'auteur a été supprimé (`created_by` remis à `NULL`) est reprise comme `order`. Les mouvements créés après la migration portent leur origine explicite.

**Invariant** : le niveau de stock d'un couple entrepôt × article est égal à la somme des mouvements du grand livre. Un test de propriété (`tests/integration/logistics-inventory.test.ts`) le vérifie sur une suite d'opérations aléatoires (graine fixe) : niveaux = sommes du grand livre = modèle de référence, jamais négatifs.

## Inventaires physiques

`OPEN → VALIDATED | CANCELLED`

- **Ouverture** (`openInventory`) : un seul inventaire en cours par entrepôt (index unique partiel + verrou de l'entrepôt). Un numéro est attribué via `core/numbering` (clé `logistics.inventory`, schéma par défaut `INV-{YYYY}-{seq:5}`) et une ligne est créée par article du tenant avec le stock théorique figé (`expected`). L'entrepôt doit être actif et le tenant avoir au moins un article.
- **Comptage** (`recordInventoryCounts`) : quantités entières de 0 à 99 999 999, vide = non compté. Modifiable tant que l'inventaire est en cours.
- **Validation** (`validateInventory`) : sous le verrou de l'entrepôt, le niveau réel de chaque ligne comptée est relu (les mouvements survenus depuis l'ouverture sont donc pris en compte) et un ajustement `delta = compté − niveau` est posté au grand livre (`kind = adjustment`, `source = inventory`, lié à l'inventaire). Ensuite, le stock vaut exactement le compté. Les lignes non comptées sont ignorées et au moins une ligne comptée est requise. Le niveau relu (`system`) et l'écart (`variance`) sont figés sur la ligne.
- **Réservations** : l'ajustement ne tient pas compte des réservations, car le comptage physique fait foi.
- **Annulation** (`cancelInventory`) : aucun mouvement n'est posté. Un inventaire validé ou annulé est figé.
- **Suppression d'un article** : elle est refusée s'il apparaît dans un inventaire (garde dans `deleteItem`). La clé étrangère ligne → article est en cascade uniquement pour que la suppression d'une organisation (tenant) aboutisse.

Les quatre actions exigent `logistics:update` sur le tenant de l'inventaire et sont journalisées dans l'audit (`LOGISTICS_INVENTORY_OPEN`, `_COUNT`, `_VALIDATE`, `_CANCEL`).

## Actions (`actions.logistics.*`)

- Expéditions : `create`, `update`, `updateTracking`, `transition`, `delete`, `lock`, `unlock`, `bulk` (annuler ou marquer livrées).
- Entrepôts : `createWarehouse`, `updateWarehouse`, `deleteWarehouse`.
- Articles : `createItem`, `updateItem`, `deleteItem`.
- Stock : `recordMovement`, `transfer`.
- Inventaires : `openInventory`, `recordInventoryCounts`, `validateInventory`, `cancelInventory`.

Les permissions `logistics:create | read | update | delete` sont vérifiées pour l'organisation de la fiche (tenant).

## Administration

- `/{lang}/admin/logistics` : liste des expéditions, avec recherche (intitulé, numéro, destinataire, suivi), filtre de statut, tris, vues enregistrées et actions groupées.
- `/{lang}/admin/logistics/new` et `/{lang}/admin/logistics/{id}/edit` : formulaire d'expédition (lignes dynamiques, brouillon uniquement).
- `/{lang}/admin/logistics/{id}` : fiche de l'expédition, avec les transitions autorisées, le numéro de BL, les lignes et le suivi transporteur.
- `/{lang}/admin/logistics/warehouses[/{id}]` et `/{lang}/admin/logistics/items[/{id}]` : entrepôts et articles.
- `/{lang}/admin/logistics/stock` : niveaux de stock, saisie de mouvement, transfert entre entrepôts et journal des mouvements.
- `/{lang}/admin/logistics/inventories` : liste des inventaires et ouverture d'un inventaire (entrepôts actifs sans inventaire en cours).
- `/{lang}/admin/logistics/inventories/{id}` : saisie des comptages, validation (enregistre d'abord les comptages) ou annulation ; une fois validé, niveaux relus, écarts et lien vers le grand livre filtré.
- `/{lang}/admin/logistics/movements` : grand livre filtrable (entrepôt, SKU, type, origine, utilisateur, période) et paginé, avec lien vers l'inventaire d'origine.

Les traductions existent en fr, en, es et ar (`i18n/`), avec une interface RTL en arabe. Le script client est `client/init.ts` (formulaires et actions de fiche).

## Tests

- `tests/unit/logistics/*.test.ts`
- `tests/integration/logistics-module.test.ts`
- `tests/integration/logistics-inventory.test.ts` (inventaires, grand livre, cohérence stock ⇔ grand livre)
- `tests/e2e/logistics-admin.spec.ts`
- `tests/e2e/logistics-inventory.spec.ts` (ouverture, comptage, validation, écart au grand livre)
- Pa11y / Lighthouse : inventaires (liste, en cours, validé) et grand livre, seedés par `tests/a11y/setup.ts`
- `tests/e2e/a11y.spec.ts` (pages logistiques)
