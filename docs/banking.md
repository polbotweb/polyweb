# Module banque — rapprochement bancaire (`src/modules/banking`)

Documentation A–Z du rapprochement bancaire, pour **tous les profils** : trésoriers, comptables, approbateurs, administrateurs d’organisation, opérateurs et développeurs.

L’interface est **strictement back-office** (aucune page publique) : `/{lang}/admin/banking/…` et `/{lang}/admin/accounting`, avec `lang` ∈ **`fr`**, **`en`**, **`es`**, **`ar`** (arabe en RTL). Toutes les chaînes existent dans ces quatre locales (`src/modules/banking/i18n/`).

Tout ce qui varie selon l’entreprise est **réglable par organisation**, avec des défauts prudents (« prêt-à-porter sur mesure »). Aucune nouvelle dépendance : parseurs, scoring, lettrage et connecteur GoCardless sont écrits en TypeScript sur Effect et les bibliothèques déjà présentes.

---

## Sommaire

1. [Vue d’ensemble](#vue-densemble)
2. [Pour les trésoriers : importer et rapprocher](#pour-les-trésoriers--importer-et-rapprocher)
3. [Pour les comptables : écritures, lettrage, FEC](#pour-les-comptables--écritures-lettrage-fec)
4. [Pour les approbateurs](#pour-les-approbateurs)
5. [Pour les administrateurs d’organisation : réglages](#pour-les-administrateurs-dorganisation--réglages)
6. [Flux bancaires automatiques (GoCardless) et versements Stripe](#flux-bancaires-automatiques-gocardless-et-versements-stripe)
7. [Pour les opérateurs et développeurs](#pour-les-opérateurs-et-développeurs)
8. [Dépannage](#dépannage)
9. [Tests](#tests)
10. [Glossaire](#glossaire)

---

## Vue d’ensemble

Le module relie trois mondes :

1. **Les relevés bancaires** importés (fichier ou flux automatique) deviennent des **lignes de relevé** (`bank_transactions`), dédoublonnées par empreinte.
2. **Les pièces ouvertes** des autres modules (factures et avoirs clients, factures et avoirs fournisseurs, lots SEPA, retours SEPA, virements internes, versements Stripe) sont proposées par un **registre de sources** générique (`src/core/reconciliation`).
3. **Le rapprochement** affecte une ou plusieurs lignes à une ou plusieurs pièces. Il crée les **vrais règlements** dans les modules concernés (`sales_payments`, `purchasing_payments`), écrit les **écarts** (frais, escompte, perte/profit, change, trop-perçu) au **grand livre banque** (`bank_ledger_entries`) et **lettre** les comptes de tiers. Le FEC reprend tout cela.

### Où cliquer

| Page | Chemin | Permission |
|:--|:--|:--|
| Tableau de bord (soldes, indicateurs, lignes à traiter) | `/{lang}/admin/banking` | `banking:read` |
| Comptes bancaires, flux, versements Stripe | `/{lang}/admin/banking/accounts` | lecture ; `banking:accounts` pour modifier |
| Imports, relevés, profils CSV | `/{lang}/admin/banking/imports` | lecture ; `banking:import` pour importer |
| Relevé | `/{lang}/admin/banking/statements/{id}` | `banking:read` |
| Ligne et écran de rapprochement | `/{lang}/admin/banking/transactions/{id}` | lecture ; `banking:reconcile` pour rapprocher |
| Rapprochements (approbation, annulation) | `/{lang}/admin/banking/reconciliations` et `…/{id}` | `banking:approve`, `banking:unreconcile` |
| Règles | `/{lang}/admin/banking/rules` | `banking:rules` pour modifier |
| Grand livre banque, export CSV | `/{lang}/admin/banking/ledger` | `banking:read` |
| Réglages | `/{lang}/admin/banking/settings` | `banking:settings` pour modifier |
| Comptabilité (plan, journaux, lettrage) | `/{lang}/admin/accounting` | `accounting:read` ; `accounting:manage` pour modifier |

Les entrées **Banque** et **Comptabilité** figurent dans la barre latérale d’administration.

### Droits

| Rôle | `banking` | `accounting` |
|:--|:--|:--|
| Administrateur plateforme, `orgOwner`, `orgAdmin` | `read`, `import`, `reconcile`, `unreconcile`, `approve`, `rules`, `accounts`, `settings` | `read`, `manage` |
| `orgMember` | `read` | `read` |

Profils suggérés (rôles personnalisés) : **comptable** = tout sauf `settings` ; **trésorier** = `read`, `import`, `reconcile` ; **lecteur** = `read`.

Chaque action serveur vérifie la permission **et** l’organisation (`requireTenantPermission`) : un administrateur d’organisation ne voit et ne modifie que les données de **son** organisation ; les données plateforme (`organizationId = null`) relèvent du RBAC global.

### Cycle de vie d’une ligne de relevé

`unmatched → suggested → (partial) → reconciled`, ou `pending_approval` (écart à approuver), ou `ignored`.

- **unmatched** : aucune proposition au-dessus du seuil.
- **suggested** : le moteur propose une ou plusieurs pièces (score 0–100).
- **partial** : une partie seulement du montant est affectée ; le reste reste à rapprocher.
- **pending_approval** : un écart (perte/profit) dépasse la politique d’approbation.
- **reconciled** : entièrement affectée. Une **annulation** (contre-passation) la remet à `unmatched`.
- **ignored** : sans incidence comptable (doublon de banque, ligne d’information) ; réintégrable.

Une ligne **provisoire** (MT942, CAMT.052, flux « pending ») est remplacée par la ligne définitive lors de l’import du relevé final (fusion, compteur « fusionnées »).

---

## Pour les trésoriers : importer et rapprocher

### Créer un compte bancaire

`Comptes bancaires → Nouveau compte`. Champs : libellé, banque, IBAN/BIC (ou numéro de compte), devise, **compte comptable** (défaut `512000`), **journal** (défaut `BQ` « Banque »), solde d’ouverture et sa date, format par défaut, profil CSV, automatisation (hérite des réglages sinon). Un compte archivé disparaît des listes mais conserve son historique.

Si l’IBAN (ou le numéro de compte) est renseigné, tout relevé importé dessus doit le porter : un relevé d’un autre compte est **refusé**.

### Importer un relevé

`Imports → Importer un relevé` : choisir le compte, le fichier, éventuellement le format (sinon détection automatique) et le profil CSV.

| Format | Détails |
|:--|:--|
| **CAMT.053** (v02 à v08) | Relevé de fin de journée ISO 20022 — format recommandé. |
| **CAMT.052** | Relevé intrajournalier (lignes provisoires). |
| **CAMT.054** | Avis de débit/crédit (lots SEPA, prélèvements, retours avec motif). |
| **MT940 / MT942** | SWIFT, variantes françaises et allemandes. |
| **CFONB 120** | Format historique des banques françaises. |
| **OFX** 1 (SGML) et 2 (XML) | Exports « Money / Quicken ». |
| **QIF** | Ordre des dates réglable (JJ/MM, MM/JJ, AAAA-MM-JJ). |
| **CSV** | Via un **profil CSV** (voir plus bas). |

Garanties :

- **Idempotence fichier** : un fichier déjà importé (même empreinte SHA-256) est ignoré, sans aucune ligne ajoutée.
- **Idempotence ligne** : chaque ligne a une empreinte (compte, date, montant, références, libellé normalisé) ; un relevé qui chevauche le précédent n’ajoute que les nouvelles lignes (« doublons » sinon).
- **Continuité** : le solde d’ouverture doit égaler le solde de clôture précédent. Écart → statut « Rupture de solde » (ou « Relevé manquant »), notification, et suspension de l’automatisation du compte si le réglage l’exige.
- **Sécurité** : taille et nombre de lignes plafonnés, DTD/entités XML refusées (XXE, « billion laughs »), fichiers bruts conservés en stockage **privé** (`banking/{org}/imports/…`) pendant la durée réglée (10 ans par défaut, obligation française pour les pièces comptables).
- **Devise** : chaque ligne porte sa devise ; une devise différente de celle du compte est refusée. Pour une devise ≠ EUR, la contre-valeur EUR est figée au cours du jour (core/money).

### Profils CSV

Les exports CSV des banques diffèrent : un **profil** décrit séparateur, décimale, format de date, encodage, mode des montants (colonne signée, ou colonnes débit/crédit), signe des débits, inversion, lignes à sauter, présence d’un en-tête et **colonne de chaque champ** (numéro 1-based ou nom d’en-tête).

Préréglages modifiables : BNP Paribas, Société Générale, Crédit Agricole, LCL, Banque Populaire / Caisse d’Épargne, Crédit Mutuel / CIC, La Banque Postale, BoursoBank, Qonto, Shine, générique ISO. `Imports → Partir d’un préréglage → Ouvrir`, ajuster, enregistrer. Les exports évoluent : vérifiez sur un premier fichier.

### Rapprocher une ligne

Depuis le tableau de bord (filtre « À traiter » par défaut), ouvrir une ligne :

1. **Propositions** : le moteur classe les pièces (référence, montant, IBAN, nom, date ; paiements groupés jusqu’à N pièces). « Utiliser » ajoute toutes les pièces de la proposition.
2. **Pièces ouvertes** : recherche libre (numéro, tiers) pour ajouter une pièce à la main.
3. **Montants imputés** : modifiables ; une imputation inférieure au montant laisse la ligne **partielle**.
4. **Écarts** : perte/profit, escompte, frais bancaires, écart de change, trop-perçu. « Ajouter un écart » propose le reste à affecter.
5. **Validation** : possible quand l’équilibre est atteint (ou en partiel). Formule : `montant de la ligne = signe × Σ imputations + Σ écarts`.

Effets d’un rapprochement validé :

- **Ventes** : règlement `sales_payments` créé, facture `PAID`/`PARTIALLY_PAID`, avoir remboursé.
- **Achats** : règlement `purchasing_payments` créé, facture fournisseur soldée ; un **lot SEPA** est rapproché en une ligne avec toutes ses factures ; un **retour SEPA** (CAMT.054 avec motif) rouvre la facture et notifie.
- **Virement interne** : la ligne sortante d’un compte et la ligne entrante d’un autre (même montant, fenêtre réglable) sont appariées et passent par le compte `580000`.
- **Versement Stripe** : le net versé est rapproché des encaissements, les frais Stripe passent en charges.
- **Grand livre banque** : une écriture équilibrée par écart, avec le journal du compte bancaire.
- **Lettrage** : code (A, B, …, AA…) posé sur la pièce et le règlement (`EcritureLet` / `DateLet` dans le FEC).
- **Audit**, **événement** `banking.reconciled` (webhooks) et **révision**.

### Écarts de change

Pour une pièce en devise, l’écart entre la contre-valeur figée de la pièce et la contre-valeur EUR de la ligne est passé automatiquement en `666000`/`766000` si `fxAutoPost` est actif et si l’écart reste ≤ 5 % du total ; au-delà, la ligne reste partielle (une seule ligne) ou le rapprochement est refusé.

### Ignorer, annuler

- **Ignorer** une ligne non rapprochée (motif facultatif) ; **Réintégrer** pour revenir en arrière.
- **Annuler** un rapprochement validé (motif obligatoire) : contre-passation datée du premier jour ouvert si la période est verrouillée, règlements contre-passés, pièces rouvertes, lettrage retiré, événement `banking.unreconciled`.

---

## Pour les comptables : écritures, lettrage, FEC

### Grand livre banque

`Grand livre` liste les écritures produites par le rapprochement : `fee` (frais), `write_off` (perte/profit), `discount` (escompte), `fx` (change), `transfer` (virement interne), `rule` (règle), `overpayment` (trop-perçu), `payout_fee` (frais de versement), `manual`, `reversal` (contre-passation). Chaque écriture est **équilibrée** (vérifiée à l’écriture et à l’export) et liée à son rapprochement et à sa ligne de relevé.

**Export CSV** : séparateur `;`, BOM UTF-8, filtres date/compte/type, 10 000 lignes au plus, **formules neutralisées** (cellules commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot préfixées d’une apostrophe — injection CSV OWASP).

### Comptes utilisés (rôles par défaut, PCG)

| Rôle | Compte par défaut |
|:--|:--|
| Banque (défaut ; chaque compte bancaire peut avoir le sien) | `512000` |
| Frais bancaires | `627000` |
| Pertes / profits sur écarts | `658000` / `758000` |
| Pertes / gains de change | `666000` / `766000` |
| Escomptes accordés / obtenus | `665000` / `765000` |
| Compte d’attente | `471000` |
| Virements internes | `580000` |
| Avances clients / fournisseurs | `419100` / `409100` |
| Encaissements carte | `512000` (inchangé si non réglé) |

Tous sont modifiables sur la page **Comptabilité** (voir `docs/accounting.md`).

### FEC

Sans réglage, le FEC est **identique** à l’historique (mêmes comptes, journaux, colonnes). Avec le rapprochement :

- les règlements utilisent le **compte et le journal** du compte bancaire rapproché ;
- les écritures du grand livre banque sont ajoutées (rang après ventes et achats) ;
- les comptes de tiers portent `EcritureLet` / `DateLet` si le lettrage est activé ;
- les montants en devise renseignent `Montantdevise` / `Idevise`.

Voir `docs/fec.md`.

### Verrouillage de période

Une date de verrouillage (manuelle, et/ou automatiquement la fin du dernier mois dont le FEC est généré) interdit toute écriture datée avant ou à cette date. Politique réglable : **refuser**, ou **reporter au premier jour ouvert** (la date d’écriture change, la date de valeur est conservée).

---

## Pour les approbateurs

Un écart **perte/profit** au-delà de la politique d’approbation (module `banking`, ressource `write_off`, core/approvals) met le rapprochement en **attente** : rien n’est comptabilisé, la ligne passe en « En approbation » et les approbateurs sont notifiés.

- **Modes** : aucun ; au-delà d’un seuil (défaut **50,00 €**) ; paliers (rôle requis par tranche de montant).
- **Décision** depuis `Rapprochements → En attente d’approbation → Détail` : Approuver (le rapprochement est appliqué tel que préparé, change recalculé) ou Rejeter (commentaire ; la ligne redevient ouverte).
- **Séparation des tâches** : l’auteur d’un rapprochement ne peut pas l’approuver lui-même, sauf administrateur plateforme.

---

## Pour les administrateurs d’organisation : réglages

`/{lang}/admin/banking/settings`. Une clé absente reprend son défaut ; toute valeur hors bornes est **refusée** (jamais corrigée silencieusement).

| Section | Réglage | Défaut | Bornes / valeurs |
|:--|:--|:--|:--|
| Import | Formats autorisés | tous | CAMT.053/052/054, MT940/942, CFONB 120, OFX, QIF, CSV |
| | Taille maximale | 20 Mio | ≤ 50 Mio |
| | Lignes maximales | 100 000 | ≤ 500 000 |
| | Conservation des fichiers | 3 650 jours | ≤ 36 500 |
| | Ordre des dates QIF | `DMY` | `DMY`, `MDY`, `YMD` |
| Rapprochement | Automatisation | `suggest` | `off`, `suggest`, `auto_exact`, `auto_threshold` |
| | Seuil d’automatisation | 95 | 0–100 |
| | Fenêtre de dates | 10 jours | 0–120 |
| | Tolérance de montant | 1,00 € et 0,5 % | la plus grande s’applique |
| | Pièces combinées max. | 8 | 1–12 |
| | Pondérations (référence, montant, IBAN, nom, date) | 40/30/15/10/5 | 0–100, somme > 0 |
| | Fenêtre des virements internes | 5 jours | |
| | Suspendre l’automatisation en cas de rupture | oui | |
| Écarts | Perte/profit automatique jusqu’à | min(1,00 €, 0,5 %) | 0 = jamais |
| | Trop-perçu | compte d’attente | attente, avance client/fournisseur, proposition de remboursement |
| | Écarts de change automatiques | oui | |
| Approbation | Mode / seuil / paliers | au-delà de 50,00 € | aucun, seuil, paliers |
| Verrouillage | Date, verrouillage après FEC, politique | aucune, oui, refuser | |
| Notifications | Heure de la tâche quotidienne | 6 h (Europe/Paris) | 0–23 |
| | Alerte d’ancienneté | 7 jours | |
| | Destinataires | propriétaires + administrateurs | + membres |
| | Types | tous actifs | import terminé/échoué, rupture, résumé quotidien, ancienneté, perte à approuver, retour SEPA, erreur de flux |
| Intégrations | Flux GoCardless | **désactivé** | |
| | Historique au 1er import | 90 jours | ≤ 730 |
| | Versements Stripe | **désactivé** | |

**Automatisation** :

- `off` : aucune proposition calculée.
- `suggest` (défaut) : propositions seulement, tout est validé à la main.
- `auto_exact` : rapprochement automatique quand références et montant sont exacts et la proposition unique.
- `auto_threshold` : automatique au-delà du seuil de score.

Chaque compte bancaire peut surcharger le mode.

### Règles

`Règles` : conditions (compte, sens, libellé contient / commence / finit / égale, montant min/max, IBAN, nom, code opération) → action (écriture sur un compte avec TVA facultative, frais bancaires, virement interne vers un compte, ignorer). Les règles s’évaluent **dans l’ordre** (↑/↓), la première qui correspond s’applique. **Simuler** indique combien de lignes des 180 derniers jours seraient concernées. « Valider sans intervention » applique la règle à l’import ; sinon elle est proposée.

---

## Flux bancaires automatiques (GoCardless) et versements Stripe

### GoCardless Bank Account Data (DSP2)

> **Important** : GoCardless n’accepte plus de **nouvelles inscriptions** à Bank Account Data depuis **juillet 2025** ; les comptes existants continuent de fonctionner. Le connecteur est livré pour ces comptes. Il implémente une interface générique (`BankFeedProvider`, `src/modules/banking/domain/feeds.ts`) : un autre agrégateur (Enable Banking, Bridge, Powens…) peut s’y brancher sans toucher au reste du module, **sur décision du propriétaire du produit**.

Mise en route (désactivé par défaut) :

1. `Réglages → Intégrations → Activer les flux bancaires automatiques`.
2. `Comptes → (compte) → Flux bancaire automatique` : saisir **Secret ID** et **Secret key** GoCardless **propres à l’organisation**. Ils sont **scellés** (chiffrement authentifié, finalité `banking.feed.gocardless`) et **jamais réaffichés** ; seul un indice masqué est montré.
3. Choisir le pays, « Charger les banques », choisir la banque, « Autoriser l’accès (DSP2) » : redirection vers la banque, puis retour sur la page Comptes.
4. « Vérifier l’autorisation » associe le compte externe (même IBAN, sinon le premier).
5. « Synchroniser maintenant », ou automatiquement chaque jour à l’heure réglée. Les lignes passent par **le même import** que les fichiers (empreintes, fusion des provisoires, rapprochement).

Le consentement dure 90 jours : à expiration, le flux passe « Expiré » et une notification invite à le renouveler. « Déconnecter » efface les identifiants et conserve l’historique.

### Versements Stripe

`Réglages → Intégrations → Activer la synchronisation des versements Stripe`, puis `Comptes → Synchroniser les versements` (ou la tâche quotidienne). Chaque versement (payout) est décomposé (brut, remboursements, frais, ajustements, net) à partir des transactions de solde Stripe ; la ligne bancaire du net est rapprochée du versement, les frais vont en `627000`. Utilise le SDK `stripe` déjà présent et `STRIPE_SECRET_KEY` (compte connecté de l’organisation si présent).

---

## Pour les opérateurs et développeurs

### Architecture

| Couche | Emplacement |
|:--|:--|
| Domaine pur (parseurs, empreintes, scoring, règles, réglages, export CSV) | `src/modules/banking/domain/` |
| Services Effect (import, appariement, rapprochement, règles, grand livre, flux, versements, cron, requêtes) | `src/modules/banking/services/` |
| Sources de rapprochement (virement interne, versement Stripe) | `src/modules/banking/reconciliation.ts` |
| Registre générique des sources | `src/core/reconciliation/` (ventes : `src/modules/sales/reconciliation.ts`, achats : `src/modules/purchasing/reconciliation.ts`) |
| Plan comptable / journaux / lettrage | `src/core/accounting/` |
| Actions Astro | `src/modules/banking/actions/` (`actions.banking.*`) |
| Pages | `src/pages/[lang]/admin/banking/`, `src/pages/[lang]/admin/accounting/` |
| Composants | `src/components/banking/admin/` |
| Client navigateur | `src/modules/banking/client/` (formulaires déclaratifs `data-banking-form`, écran de rapprochement) |
| API publique | `src/modules/banking/api/public-api.ts` |
| Cron | `src/pages/api/cron/banking.ts` |

Les services n’importent jamais `astro:actions` (erreurs via `@/lib/effect/failure`) : ils restent utilisables par le cron, l’API et les tests.

### Ajouter une source de rapprochement

Implémenter `ReconciliationSource` (`src/core/reconciliation/registry.ts`) : `key`, `candidates(org, line, search?)`, `apply(tx, input)` (crée les effets métier, renvoie `effects` pour l’annulation, `aux` pour le lettrage), `reverse(tx, effects)`, et `postsBank: true` si la source écrit elle-même le côté banque (elle doit alors être rapprochée seule). Puis `registerReconciliationSource(source)` au démarrage (`src/core/modules/bootstrap.ts`).

### Modèle de données (migration 0058)

`bank_settings`, `bank_csv_profiles`, `bank_accounts`, `bank_imports`, `bank_statements`, `bank_transactions`, `bank_reconciliations`, `bank_reconciliation_lines`, `bank_reconciliation_allocations`, `bank_ledger_entries`, `bank_ledger_lines`, `bank_rules`, `bank_feed_connections`, `bank_payouts`, `bank_payout_items`, `accounting_settings`, `accounting_accounts`, `purchasing_sepa_export_lines` ; colonnes ajoutées aux règlements (compte bancaire, rapprochement, lettrage) et aux lots SEPA (date d’exécution, compte).

Toutes les tables portent `organization_id` (NULL = plateforme) et des index par organisation. Montants en **unités mineures** (`bigint`), jamais de flottants.

### Migration 0058 — up / down

- `src/database/migrations/0058_banking_reconciliation.sql` (généré par Drizzle) ;
- `src/database/migrations/down/0058_banking_reconciliation.down.sql` : supprime tables et colonnes dans l’ordre inverse des dépendances. Testé par `tests/integration/banking-migration.test.ts` (down puis up dans une transaction annulée) et par `purchasing-migration.test.ts` (0058 descendue avant 0057).

### Cron

`POST /api/cron/banking` (secret de cron, comme les autres tâches), à appeler **toutes les heures**. Chaque organisation s’exécute à son heure (`cronHour`, Europe/Paris), une fois par jour : synchronisation des flux et versements (si activés), rapprochement automatique des lignes ouvertes, alertes d’ancienneté, résumé quotidien, purge des fichiers bruts au-delà de la conservation.

### API publique

Ressource `bank-imports` : `GET` (scope `banking:read`, filtres `status`, `bankAccountId`, pagination par curseur) et `POST` (scope `banking:write`, corps `{ bankAccountId, fileName, contentBase64, format? }`, `Idempotency-Key` gérée par le cœur ; un fichier déjà importé est sans effet). Événements webhooks : `banking.imported`, `banking.reconciled`, `banking.unreconciled`. Voir `docs/public-api.md`.

### Notifications

Catégorie « banking », canal in-app, types `banking:IMPORT_DONE`, `IMPORT_FAILED`, `CONTINUITY_BREAK`, `DAILY_DIGEST`, `AGING`, `WRITE_OFF_APPROVAL`, `SEPA_RETURN`, `FEED_ERROR` ; destinataires selon les rôles réglés, déduplication par jour et par ressource. Voir `docs/notifications.md`.

### Audit

Toute écriture est auditée (`audit_log`, module `banking` ou `accounting`) : réglages, comptes, profils, imports, rapprochements, approbations, annulations, règles, flux (sans secret), versements, plan comptable.

### Sécurité

- Back-office uniquement ; permission **et** organisation vérifiées à chaque action ; toutes les requêtes filtrent par organisation.
- Identifiants GoCardless **scellés** (core/secrets), jamais renvoyés au navigateur (`publicFeedView`), jamais journalisés.
- XML sans DTD ni entité ; tailles, lignes et durée de recherche des combinaisons bornées.
- Export CSV protégé contre l’injection de formules.
- Fichiers bruts en stockage privé, `cache-control: private, no-store`.
- Écritures équilibrées vérifiées ; période verrouillée respectée ; séparation des tâches à l’approbation.

### Performance

Index sur `(organization_id, status, booking_date)`, empreintes uniques par compte, recherche de combinaisons bornée en temps (`combinationTimeMs`), propositions limitées, listes paginées, lettrage par séquence en base (`nextLetteringCode`, clé `accounting.lettering` de `document_sequences`, attribuée paresseusement).

### Dépendances

Aucune nouvelle dépendance (parseurs maison, XML via `@/core/xml`, Stripe via le SDK existant, GoCardless via `fetch`).

---

## Dépannage

| Symptôme | Cause probable | Solution |
|:--|:--|:--|
| « Fichier déjà importé » | Même fichier (empreinte) | Rien à faire : aucune ligne ajoutée. |
| « Le relevé ne correspond pas à ce compte » | IBAN du fichier ≠ IBAN du compte | Choisir le bon compte ou corriger l’IBAN. |
| Rupture de solde | Relevé manquant ou solde d’ouverture erroné | Importer le relevé manquant ; vérifier le solde d’ouverture du compte. |
| CSV : « colonne requise » | Profil incomplet | Renseigner date et montant (ou débit + crédit). |
| Aucune proposition | Fenêtre de dates ou tolérance trop étroite, pièce déjà réglée | Élargir les réglages ou chercher la pièce à la main. |
| « Période verrouillée » | Date ≤ date de verrouillage | Politique « reporter au premier jour ouvert » ou déverrouiller. |
| Flux « Expiré » | Consentement DSP2 de 90 jours échu | « Autoriser l’accès » à nouveau. |
| Flux : « Chiffrement indisponible » | Secret de signature absent côté serveur | Vérifier la configuration des secrets (docs/security.md). |
| Versements : « STRIPE_SECRET_KEY absente » | Clé Stripe non configurée | Configurer Stripe (docs/payments.md). |

---

## Tests

- Unitaires : `tests/unit/banking/` — parseurs (CAMT 053 v02/v08, 054, MT940 DE/FR, MT942, CFONB 120, OFX 1/2, QIF, CSV, XXE/bombe), domaine (empreintes, scoring, règles, réglages, verrouillage), FEC avec grand livre et lettrage (`fec-ledger.test.ts`).
- Intégration : `tests/integration/banking-reconciliation.test.ts` (import idempotent, cloisonnement, rapprochement et annulation, approbation et séparation des tâches, verrouillage, règles, flux GoCardless et versements Stripe avec fournisseurs injectés), `banking-migration.test.ts`.
- E2E : `tests/e2e/banking-admin.spec.ts` (compte, import OFX, ligne ignorée/réintégrée, règle simulée, réglages, export du grand livre, comptabilité).
- Accessibilité : pages banque et comptabilité dans `.pa11yci.cjs` et `lighthouserc.cjs`.

---

## Glossaire

- **Rapprochement** : affectation de lignes de relevé à des pièces.
- **Lettrage** : code commun posé sur une pièce et son règlement (comptes de tiers).
- **Écart** : différence entre le montant bancaire et les pièces (frais, escompte, perte/profit, change, trop-perçu).
- **Continuité** : enchaînement des soldes de relevé à relevé.
- **Ligne provisoire** : ligne intrajournalière remplacée par la ligne définitive.
- **Source** : type de pièce rapprochable (facture client, facture fournisseur, lot SEPA, virement interne, versement Stripe…).
