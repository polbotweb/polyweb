# Module achats (`src/modules/purchasing`)

Documentation A–Z du module Achats / Fournisseurs, pour **tous les profils** : acheteurs, approbateurs, comptables, administrateurs d’organisation, opérateurs et développeurs.

L’interface d’administration est **strictement back-office** (aucune page publique) : `/{lang}/admin/purchasing/…` avec `lang` ∈ **`fr`**, **`en`**, **`es`**, **`ar`** (arabe en RTL). Toutes les chaînes du module existent dans ces quatre locales (`src/modules/purchasing/i18n/`). Les libellés logistiques du mouvement `purchase_return` également (fr : « Retour fournisseur », en : « Supplier return », es : « Devolución a proveedor », ar : « مرتجع مورد »).

Tout ce qui varie selon le métier est **configurable par organisation** (« prêt-à-porter sur mesure »), avec des défauts sûrs. Rien n’est codé en dur pour une entreprise particulière. L’import de relevés bancaires et le lettrage sont le sujet du PR suivant ; les **crochets** (table des règlements, écritures, événements) sont déjà en place.

---

## Sommaire

1. [Vue d’ensemble et parcours](#vue-densemble-et-parcours)
2. [Pour les acheteurs](#pour-les-acheteurs)
3. [Pour les approbateurs](#pour-les-approbateurs)
4. [Pour les comptables](#pour-les-comptables)
5. [Pour les administrateurs d’organisation](#pour-les-administrateurs-dorganisation) (tous les réglages, défauts, exemples)
6. [Pour les opérateurs et développeurs](#pour-les-opérateurs-et-développeurs)
7. [Dépannage](#dépannage)
8. [Tests](#tests)

---

## Vue d’ensemble et parcours

### Cycle de vie d’une commande

`DRAFT → PENDING_APPROVAL? → SENT → PARTIALLY_RECEIVED → RECEIVED → CLOSED` (+ `CANCELLED`).

- Une commande **envoyée** peut revenir en brouillon (`SENT → DRAFT`). On peut l’annuler depuis `DRAFT` ou `SENT`.
- `PARTIALLY_RECEIVED` et `RECEIVED` sont posés **uniquement par une réception**, jamais comme transition manuelle.
- Le **numéro de bon de commande** est attribué au passage `DRAFT → SENT` (ou à l’issue d’une approbation qui envoie) via `core/numbering`.
- Seul un brouillon est modifiable. Seuls un brouillon ou une commande annulée **sans réception** peuvent être supprimés.
- Une commande partiellement ou entièrement reçue peut être soldée (`CLOSED`).

### Où cliquer (toutes locales)

| Page | Chemin |
|:--|:--|
| Liste des commandes | `/{lang}/admin/purchasing` |
| Nouvelle commande | `/{lang}/admin/purchasing/new` |
| Fiche / édition / réception | `/{lang}/admin/purchasing/{id}` et `…/{id}/edit` |
| Fournisseurs | `/{lang}/admin/purchasing/suppliers` et `…/suppliers/{id}` |
| Réceptions | `/{lang}/admin/purchasing/receipts` |
| Réglages | `/{lang}/admin/purchasing/settings` |
| Factures / avoirs | `/{lang}/admin/purchasing/invoices` et `…/invoices/new`, `…/invoices/{id}` |
| Réassort | `/{lang}/admin/purchasing/reorder` |
| Retours | `/{lang}/admin/purchasing/returns` |
| Export SEPA | `/{lang}/admin/purchasing/sepa` |
| Import d’e-factures | `/{lang}/admin/purchasing/imports` |

`lang` = `fr` | `en` | `es` | `ar`. Le bouton « Nouvelle commande » porte le `data-testid="purchasing-new-order"`.

### Droits en un coup d’œil

| Rôle | Droits `purchasing` |
|:--|:--|
| Administrateur plateforme, `orgOwner`, `orgAdmin` | `create`, `read`, `update`, `delete`, `send`, `approve`, `invoice`, `payment` |
| `orgMember` | `read` uniquement |

Les pages de réglages, factures, SEPA, imports, etc. restent réservées au back-office organisation / plateforme (pas de surface publique).

---

## Pour les acheteurs

### Fournisseurs

Créer ou modifier une fiche dans `…/suppliers`. Champs utiles au quotidien :

- **Code** (normalisé en majuscules, unique par tenant) et **nom**.
- **IBAN / BIC / nom SEPA** : l’IBAN est contrôlé (mod-97), le BIC aussi. Exemples d’IBAN valides pour les tests : `FR1420041010050500013M02606`, `DE89370400440532013000`. Ces identifiants servent aux lots de prélèvement / virement SEPA.
- **Liens CRM** : `crmCompanyId` et `crmContactId` (UUID) pour rattacher le fournisseur à une société ou un contact du module CRM, sans dupliquer la fiche.
- **Catalogue de confiance** (`trustedCatalogue`) : indispensable si l’organisation active le réassort en **envoi automatique** (`auto_send`). Sans cette case, l’auto-envoi est refusé (réglage `reorderAutoSendTrustedOnly`, défaut : activé).
- **Punch-out** : URL de setup, identité, domaine, secret. Le secret est un champ mot de passe : **il n’est jamais réaffiché** ; un champ laissé vide **conserve** le secret déjà enregistré.

### Commandes (bons de commande)

1. Créer un brouillon (`create`) : intitulé, fournisseur, devise, date prévue, notes, entrepôt principal.
2. **Lignes** :
   - type **stock** (article logistique, réceptionnable) ou **prestation** (hors stock, `itemId` nul, non réceptionnée en stock — si `allowServiceLines` est activé, défaut : oui) ;
   - **entrepôt par ligne** si le multi-entrepôt est activé (défaut : oui).
3. Si la politique d’approbation l’exige (montant), la tentative d’envoi place la commande en `PENDING_APPROVAL` au lieu de `SENT`.
4. Sinon, l’envoi (`send`) attribue le numéro (`BC-YYYY-00001` par défaut), génère le **PDF**, le stocke en privé et met en file un e-mail transactionnel `purchasing.po-send` avec le PDF en pièce jointe (placeholders `{number}`, `{title}`, `{supplierName}`). Les modèles par locale se règlent dans les paramètres ; à défaut, le gabarit intégré de la locale est utilisé (`fr` / `en` / `es` / `ar`).
5. Réceptionner (`receive`) une commande `SENT` ou `PARTIALLY_RECEIVED` : quantité par ligne (0 = non reçue), jamais au-delà du reliquat. Les **lignes de prestation ont un reliquat à 0** et sont ignorées par le plan de réception. Chaque ligne stock crée un mouvement logistique `source = purchase` dans l’entrepôt de la ligne (ou de la commande).
6. Un **contrôle qualité** peut être exigé à la réception si l’administrateur l’a activé.
7. **Frais d’approche** (transport, douane, etc.) : allocation sur les lignes par **valeur**, **quantité** ou **poids**.
8. **Punch-out** : si le fournisseur est configuré, un setup cXML 1.2 ouvre le catalogue fournisseur ; le retour `PunchOutOrderMessage` crée un **brouillon** de commande. Le callback est `POST /api/purchasing/punchout/<cookie>?mac=` (HMAC).

### Réassort

Page `…/reorder`. Selon le mode configuré, l’acheteur voit des **suggestions** (disponibilité = stock + commandé non reçu − réservé si le réglage l’inclut). Un calcul à la demande est possible si l’utilisateur a le droit `update`. Les modes `auto_draft` / `auto_send` sont détaillés dans les réglages admin.

### Retours fournisseur

Page `…/returns`. Cycle : `DRAFT → AUTHORIZED → SHIPPED → RECEIVED_BY_SUPPLIER → CREDITED` (ou `CANCELLED`). Le passage **`AUTHORIZED → SHIPPED` sort du stock** (`source = purchase_return`). Numéro `RF-YYYY-…` à l’émission du flux.

---

## Pour les approbateurs

Moteur générique `src/core/approvals` (réutilisable par d’autres modules). Politique **par organisation**.

### Modes (défaut : `none`)

| Mode | Comportement |
|:--|:--|
| `none` | Aucune approbation. L’envoi passe directement en `SENT` (si l’utilisateur a `send`). |
| `single_threshold` | En dessous du seuil (unités mineures), pas d’approbation. **Au seuil ou au-dessus**, un palier unique (rôle par défaut `orgAdmin`, surchargeable par le premier palier enregistré). |
| `bands` | Tous les paliers dont la fourchette couvre le montant forment une **chaîne**. Un palier s’applique si `montant ≥ min` et (`max` est nul ou `montant < max`). Les paliers sont triés par `level`. |

Exemple **seuil unique** : seuil = `50_000` (500,00 € si la devise a 2 décimales). Une commande à 499,99 € s’envoie sans circuit ; à 500,00 € elle passe en `PENDING_APPROVAL` et attend un `orgAdmin` (ou un rôle supérieur).

Exemple **paliers** (laisser `max = null` sur les paliers inférieurs pour une chaîne typique) :

| Niveau | Min | Max | Rôle |
|:--|:--|:--|:--|
| 1 | 0 | (nul) | `orgAdmin` |
| 2 | 100_000 (1 000,00 €) | (nul) | `orgOwner` |

Une commande de 1 200,00 € doit être approuvée **d’abord** par un admin d’organisation, **puis** par un propriétaire. Un `orgOwner` satisfait aussi le palier `orgAdmin` (hiérarchie : `orgMember` < `orgAdmin` < `orgOwner` ; un **administrateur plateforme** satisfait tous les rôles). Un palier peut en plus exiger la permission `purchasing:approve`.

### Décisions

- Le premier palier est `PENDING`, les suivants `WAITING`.
- **Approuver** fait passer le palier suivant de `WAITING` à `PENDING`. Quand tous les paliers sont approuvés (ou sautés), la commande est **envoyée** (numéro + e-mail).
- **Rejeter** saute les paliers restants (`SKIPPED`) et ramène la commande en **`DRAFT`**.
- L’éditeur de paliers (réglages) permet d’ajouter, modifier, supprimer des paliers. Les paliers existants sont **conservés à l’enregistrement même si l’on change de mode** (pour ne pas perdre la chaîne en passant provisoirement à `none`). Le mode `bands` exige toutefois une liste non vide.

---

## Pour les comptables

### Factures et avoirs fournisseurs

Page `…/invoices`. Statuts : `DRAFT → ISSUED → PARTIALLY_PAID → PAID` (ou `CREDITED` / `CANCELLED`). Seul un brouillon est éditable. Numéros : facture `FF-YYYY-…`, avoir `AF-YYYY-…` (préfixes configurables).

**Rapprochement** (commande / réception / facture) :

| Mode | Comparaison | Défaut |
|:--|:--|:--|
| `two_way` | Facture vs **quantités commandées** | — |
| `three_way` | Facture vs **quantités reçues** | **oui** |

Tolérances par défaut : **1,00** en unités mineures (`toleranceAbsoluteMinor = 100`) **et** **1 %**. Une ligne est `matched`, `qty_variance` ou `price_variance`. Politique :

- `allow_with_acceptance` (**défaut**) : on peut émettre la facture malgré un écart **si** les lignes concernées sont **acceptées**.
- `block` : l’émission est **refusée** tant qu’il reste un écart hors tolérance, **même si** les lignes sont acceptées.

Règlements (`purchasing:payment`) : méthodes reprises du module ventes (`PAYMENT_METHODS`). Un règlement partiel passe la facture en `PARTIALLY_PAID`.

### Import d’e-factures

Page `…/imports`. Analyse **en interne, sans nouvelle dépendance** :

- XML **UBL** et **CII** (EN 16931) ;
- **Factur-X** : extraction du XML embarqué dans un PDF (`pdf-lib`, déjà présent depuis le module Ventes / PR #77, plus `zlib` Node).

Le fichier est stocké en privé. Si le fournisseur n’est pas reconnu : statut `unmatched_supplier`.

### SEPA pain.001

Page `…/sepa`. Génération interne de **pain.001.001.03** (pas de bibliothèque tierce). **EUR uniquement**. IBAN (mod-97) et BIC validés. L’identité du **débiteur** (nom, IBAN, BIC) se renseigne dans les réglages. Numéro de lot `SEPA-YYYY-…`. Le fichier est stocké en privé avec empreinte SHA-256.

### Journal FEC HA et écritures

L’export FEC mensuel (module Ventes, `docs/fec.md`) inclut le journal **HA (Achats)**, ordre des journaux : VE = 0, HA = 1, BQ = 2.

`buildPurchaseEntry` (`src/modules/tax/domain/accounting.ts`) :

- débit **607000** (achats HT, par taux) et **445660** (TVA déductible) ;
- crédit **401000** (fournisseur, TTC) ;
- un **avoir inverse** les sens.

Les **règlements** fournisseurs apparaissent aussi (401 / 512). Comptes par défaut (surchargeables) : payable `401000`, charge `607000`, TVA `445660`, banque `512000`. L’écriture est toujours vérifiée **équilibrée**. `EcritureNum` = `<journal><AAAAMM><seq:5>`.

L’import de relevés et le lettrage bancaire seront livrés dans un PR suivant (crochets déjà exposés).

---

## Pour les administrateurs d’organisation

Tout se règle dans `/{lang}/admin/purchasing/settings` (org-admin / propriétaire / plateforme). Les valeurs ci-dessous sont celles de `DEFAULT_PURCHASING_SETTINGS` et `DEFAULT_APPROVAL_POLICY`.

### Réassort

| Réglage | Défaut | Signification |
|:--|:--|:--|
| `reorderMode` | `suggestions` | `off` : rien. `suggestions` : calcule et affiche. `auto_draft` : crée des brouillons. `auto_send` : crée et envoie (voir ci-dessous). |
| `reorderHour` | `6` | Heure **0–23** à laquelle le cron `POST /api/cron/purchasing` traite ce tenant. |
| `reorderIncludeReservations` | `false` | Si vrai, la disponibilité retranche le stock **réservé**. Formule : `disponible = onHand + outstanding − reserved`. Une suggestion naît si `disponible ≤ minQty` ; la qty proposée vise `maxQty`. |
| `reorderAutoSendTrustedOnly` | `true` | L’**auto-envoi** n’est autorisé que si le mode est `auto_send` **et** (si ce drapeau est vrai) le fournisseur a le **catalogue de confiance**. |

**Important** : le cron appelle le réassort avec `authorId = null`. Les suggestions sont bien calculées, mais **la création automatique de brouillons / l’envoi automatique est sautée** tant qu’aucun auteur n’est fourni (`if (!action.createDraft \|\| !authorId) continue`). Un calcul **manuel** depuis la page Réassort (utilisateur authentifié, droit `update`) peut créer les brouillons.

Exemple : une org veut uniquement des listes le matin, sans jamais envoyer toute seule → `suggestions`, heure `6`, réservations off. Une org qui fait confiance à deux fournisseurs catalogue → `auto_send` + cases « catalogue de confiance » sur ces fiches seulement.

### Approbation

Défaut : mode `none`, seuil `0`, devise `EUR`, paliers `[]`. Voir [Pour les approbateurs](#pour-les-approbateurs). L’éditeur de paliers (rôle + permission optionnelle, min/max en unités mineures, niveau 1–20 unique) **renvoie toujours les paliers existants** à l’enregistrement, y compris après un changement de mode.

### Rapprochement, taxes, délais, devise

| Réglage | Défaut | Contraintes / exemple |
|:--|:--|:--|
| `matchingMode` | `three_way` | `two_way` ou `three_way`. |
| `toleranceAbsoluteMinor` | `100` | Entier ≥ 0. `100` = 1,00 € si 2 décimales. |
| `tolerancePercent` | `1` | 0–100. `1` = 1 %. |
| `matchingPolicy` | `allow_with_acceptance` | ou `block` (aucune émission en écart, même accepté). |
| `defaultTaxCategory` | `standard` | Catégorie fiscale par défaut des lignes. |
| `defaultPaymentTermDays` | `30` | 0–365 jours. |
| `defaultCurrency` | `EUR` | Code ISO à 3 lettres (`^[A-Z]{3}$`). Les lots SEPA exigent **EUR**. |
| `qualityControlRequired` | `false` | CQ obligatoire à la réception. |
| `allowServiceLines` | `true` | Lignes de prestation (hors stock). |
| `allowMultiWarehouse` | `true` | Entrepôt par ligne. |

### Numérotation

Schéma commun : `{prefix}-{YYYY}-{seq:5}`, **sans trou**, **remise à zéro chaque année** (`core/numbering`). Le préfixe doit matcher `^[A-Z][A-Z0-9]{0,7}$` (1 à 8 caractères, commence par une lettre).

| Document | Clé | Préfixe par défaut | Exemple |
|:--|:--|:--|:--|
| Bon de commande | `purchasing.order` | `BC` | `BC-2026-00001` |
| Bon de réception | `purchasing.receipt` | `BR` | `BR-2026-00001` |
| Facture fournisseur | `purchasing.invoice` | `FF` | `FF-2026-00001` |
| Avoir | `purchasing.credit_note` | `AF` | `AF-2026-00001` |
| Retour | `purchasing.return` | `RF` | `RF-2026-00001` |
| Lot SEPA | `purchasing.sepa` | `SEPA` | `SEPA-2026-00001` |

### Modèles d’e-mail par locale

Purposes : `po_send`, `po_reminder`, `return_notice`. Pour chaque purpose et chaque locale (`fr`, `en`, `es`, `ar`) on peut surcharger **objet** et **corps**. Placeholders : `{number}`, `{title}`, `{supplierName}`. À l’envoi, `resolvePurchasingEmailOverride` applique la surcharge ; sinon **repli sur le gabarit intégré** de la locale. L’envoi actuel du BC utilise le type de notification `PURCHASE_ORDER_SENT` et le template `purchasing.po-send` (transactionnel, PDF joint via l’outbox — jamais de colonne `attachments` sur la table des notifications in-app).

### Compte débiteur SEPA

`debtorName`, `debtorIban`, `debtorBic` : optionnels jusqu’à l’export, mais l’IBAN / BIC sont validés dès qu’ils sont renseignés.

---

## Pour les opérateurs et développeurs

### Architecture

- Module : `src/modules/purchasing` (pas de `module:new` : extension du module existant). Définition : `module.ts` (`id: "purchasing"`, entité `purchaseOrder`, capacités explicites : content, publication, revisions, locks).
- **Domaine pur** (Effect, sans I/O) : `domain/` — workflow, numbering, order (validation IBAN/BIC/CRM/punch-out, lignes service), receipt (reliquat, skip des prestations), settings, matching, reorder, invoice, payments, returns, landed-costs, punchout, errors.
- **Cœur réutilisable** : `src/core/approvals` (politique, paliers, décisions), `src/core/sepa` (IBAN, pain.001), `src/core/einvoice` (parse CII/UBL, extract Factur-X). Pièces jointes e-mail dans le typage SMTP / l’outbox.
- **Application** : `services/` (settings, invoices, ops, approvals, purchasing, e-mail templates), `actions/`, `loaders/`, `documents/` (PDF + notify), `notifications/`, `client/forms.ts` + `init.ts`.
- **UI** : `src/pages/[lang]/admin/purchasing/…`, composants `src/components/purchasing/admin/` (`PurchaseOrderForm`, `SupplierForm`, nav).
- Écritures partout via **Effect** ; montants en **unités mineures** (`core/money`). Multi-tenant : `organizationId` nul = plateforme.

### Modèle de données

Migrations **0034** (tables de base : fournisseurs, commandes, lignes, réceptions, révisions, verrous) et **0035** (FK `DEFERRABLE INITIALLY DEFERRED` pour les cascades d’organisation).

Migration **0057** `purchasing_invoices_reorder` (journal idx 57) ajoute notamment :

`purchasing_settings`, `purchasing_email_templates`, `purchasing_supplier_contacts`, `purchasing_supplier_items`, `purchasing_invoices` / `_lines` / `_revisions` / `_locks`, `purchasing_payments`, `purchasing_reorder_rules`, `purchasing_reorder_suggestions`, `purchasing_returns` / `_lines`, `purchasing_quality_checks` / `_lines`, `purchasing_landed_costs` / `_lines`, `purchasing_einvoice_imports`, `purchasing_sepa_exports`, `purchasing_punchout_sessions`.

Également : colonnes fournisseur (IBAN/BIC, CRM, punch-out, catalogue de confiance), lignes de commande (`item_id` nullable, `kind`, `warehouse_id`, taxes), commandes (taxes, brut, `approvalRequestId`, origine). Snapshot Drizzle : `src/database/migrations/meta/0057_snapshot.json`.

Tables d’approbation génériques : `approval_policies`, `approval_bands`, `approval_requests`, `approval_steps`.

`email_outbox.attachments` (jsonb, défaut `[]`) porte les pièces jointes ; **ne pas** ajouter `attachments` à la table `notifications`.

### Migration 0057 — up / down

- **Up** : voir `src/database/migrations/0057_purchasing_invoices_reorder.sql`.
- **Down** (`src/database/migrations/down/0057_purchasing_invoices_reorder.down.sql`) : `SET CONSTRAINTS ALL IMMEDIATE` puis **suppression des lignes de prestation** (`item_id` nul ou `kind <> 'stock'`) **et** des lignes de réception liées, **avant** tout `ALTER` sur `purchasing_order_lines` (évite l’erreur Postgres `55006` « pending trigger events » due aux FK différées de 0035). Ensuite rétablissement de `item_id NOT NULL`. Cette perte de données à la descente est **volontaire**.
- Test d’intégration : `tests/integration/purchasing-migration.test.ts` — lecture du journal / tables sur la base de test partagée ; **down/up complet sur une base jetable** `polyweb_po57_*` (migrate, insérer une ligne service, `BEGIN` / down / up / `ROLLBACK`, `DROP DATABASE … WITH (FORCE)`) pour ne pas verrouiller les autres suites.

### Notifications et e-mail

Registre : type `PURCHASE_ORDER_SENT`, catégorie `purchasing`, canal e-mail, template `purchasing.po-send`, transactionnel. Déduplication : `purchasing.po-send:{orderId}:{number}`. Le PDF est chargé depuis `privateStorage()` au moment de l’envoi (le service Effect `PrivateStorage` n’est pas propagé dans `dbTransaction`).

### Matrice des permissions

Actions : `create`, `read`, `update`, `delete`, `send`, `approve`, `invoice`, `payment`. Ressources typées : commande, fournisseur, réception, facture, retour, SEPA, import. Vérification toujours **dans le tenant** de la fiche (`requirePurchasingResourcePermission`).

Voir le tableau [Droits en un coup d’œil](#droits-en-un-coup-dœil). Le socle `orgMember` reste en lecture seule. La baseline des tests (`tests/unit/fixtures/permissions-baseline.json`) liste `send` / `approve` / `invoice` / `payment` pour statement, admin, orgOwner, orgAdmin — pas pour orgMember.

### Audit et révisions

Le module déclare `audit: false` au contrat de capacités (pas de ressource CMS auditable générique, donc pas d’actions `SALES_*` / journal d’audit plateforme pour les achats). En revanche chaque mutation métier pose une **révision** (`purchasing_order_revisions`, `purchasing_invoice_revisions`) avec `authorId`, titre, slug, statut et une **note** en français (libellé métier, pas un code i18n). Les verrous (`locks`) empêchent les éditions concurrentes.

Notes de révision — commandes (`purchasing.service` / actions groupées) :

| Note | Quand |
|:--|:--|
| `Création` | Brouillon créé |
| `Mise à jour` | Édition d’un brouillon |
| `Soumise à approbation` | Envoi qui ouvre un circuit (`PENDING_APPROVAL`) |
| `Statut {from} → {to}` | Transition manuelle (ex. `SENT → DRAFT`, `SENT → CANCELLED`, `RECEIVED → CLOSED`) |
| `Réception {number}` | Bon de réception créé (`BR-…`) |
| `Action groupée : {op}` | Action de masse (`cancel`, etc.) |

Notes de révision — factures (`invoices.service`) : `Création`, `Mise à jour`, `Acceptation des écarts`, `Émission`, `Règlement`, `Annulation`.

### Événements

Le module **n’enregistre pas encore** de noms dans le bus `src/core/events` (`registerEventNames` / `emitEvent`). Les webhooks et plugins ne reçoivent donc pas d’événements `purchasing.*` pour l’instant. La trace opérable est : révisions ci-dessus, notification `PURCHASE_ORDER_SENT` (e-mail `purchasing.po-send`), écritures comptables (journal HA) et table `purchasing_payments`.

Ces **crochets** (règlements, écritures 401/512, états de facture) sont en place pour l’import de relevés bancaires et le lettrage (PR suivant). Ne pas réutiliser l’événement Ventes `invoice.issued` (factures clients).

### Cron

`POST /api/cron/purchasing`, authentifié par `CRON_SECRET` (`requireCron`). Pour chaque tenant (y compris plateforme) : si le mode n’est pas `off` et que l’heure courante (`new Date().getHours()`) égale `reorderHour`, appelle `runReorder(organizationId, null)`. Voir la limitation `authorId` ci-dessus.

### Punch-out (détail opérable)

cXML 1.2 : `PunchOutSetupRequest` + `PunchOutOrderMessage`. Cookie HMAC `punchOutMac`. Callback `POST /api/purchasing/punchout/<cookie>?mac=`. Session table `purchasing_punchout_sessions` (échéance, hook, statut).

### Sécurité

- Isolation **tenant** (`organizationId`) sur toutes les requêtes.
- Pages **org-admin / plateforme** uniquement ; pas de surface publique.
- Permissions fines (`send`, `approve`, `invoice`, `payment`).
- Secret punch-out jamais renvoyé à l’UI ; champ vide = conservation.
- MAC HMAC sur le callback punch-out.
- Cron protégé par secret.
- Validation IBAN (mod-97) / BIC ; SEPA limité à **EUR**.
- PDF et XML d’e-facture / lots SEPA en **stockage privé**.
- Pièces jointes uniquement sur l’**outbox** e-mail.
- Sanitization et permissions déjà imposées par le socle Polyweb.

### Limites et validations

- Préfixes : `^[A-Z][A-Z0-9]{0,7}$`.
- Heure de réassort : entier 0–23.
- Délai de paiement : 0–365.
- Devise : 3 lettres majuscules.
- Tolérance % : 0–100 ; tolérance absolue : entier ≥ 0.
- Paliers : `level` unique dans 1–20 ; `minMinor` ≥ 0 ; si `max` est posé, `max > min`.
- Mode `bands` : au moins un palier.
- SEPA : EUR uniquement.

### Dépendances

Aucune nouvelle dépendance n’a été ajoutée pour ce module. **pdf-lib** (`^1.17.1`) était déjà présent (Factur-X Sales, PR #77, commit `7eab4ca`).

---

## Dépannage

| Symptôme | Piste |
|:--|:--|
| L’envoi automatique ne part pas | Mode `auto_send` + catalogue de confiance + `reorderAutoSendTrustedOnly`. Le **cron** ne crée pas de brouillon sans `authorId` : lancer le calcul depuis l’UI ou fournir un auteur. |
| La commande reste en `PENDING_APPROVAL` | Politique seuil / paliers ; l’acteur a-t-il le rôle et `purchasing:approve` ? |
| Les paliers ont disparu après un changement de mode | Ils doivent être **ré-envoyés** par le formulaire (c’est le comportement prévu de l’éditeur). Le mode `bands` refuse une liste vide. |
| Impossible d’émettre une facture en écart | Politique `block`, ou `allow_with_acceptance` sans **acceptation** des lignes hors tolérance. En 3 voies, comparer aux **quantités reçues**. |
| `down` 0057 échoue (`item_id NOT NULL` ou `55006`) | Le down doit d’abord `SET CONSTRAINTS ALL IMMEDIATE` et supprimer les lignes de prestation / réception. |
| Secret punch-out « perdu » | Un champ vide **conserve** l’ancien secret ; il n’est jamais réaffiché. |
| E-mail sans surcharge | Vérifier la locale et le purpose ; repli attendu sur le gabarit intégré. |
| IBAN / SEPA rejeté | IBAN mod-97, BIC, devise EUR, débiteur renseigné à l’export. |
| Org member ne peut pas créer de commande | Normal : `orgMember` = `read` seulement. |

---

## Tests

- Unitaires : `tests/unit/purchasing/` (`domain`, `matching-reorder`, `einvoice-import`, `po-send-email` — surcharge et repli —, `admin-resource`) ; `tests/unit` du cœur `approvals` / `sepa` / e-facture.
- Intégration : `purchasing-module.test.ts`, `purchasing-invoices.test.ts`, `purchasing-migration.test.ts` (journal + down/up jetable).
- E2E : `tests/e2e/purchasing-admin.spec.ts`, `purchasing-settings.spec.ts` (titre « Réassort » en correspondance **exacte** pour ne pas confondre avec le sous-titre vide), scénarios a11y des pages achats.
- Accessibilité : pa11y et Lighthouse sur les URLs `/{lang}/admin/purchasing/{settings,invoices,reorder,returns,sepa,imports}` pour **fr, en, es, ar**.
