# Comptabilité — plan comptable, journaux et lettrage (`src/core/accounting`)

Le cœur **comptabilité** fournit à tous les modules (ventes, achats, banque, FEC) un **plan comptable par organisation**, des **journaux** et le **lettrage**. Il est réglé sur la page back-office `/{lang}/admin/accounting` (`lang` ∈ `fr`, `en`, `es`, `ar`).

**Sans aucun réglage, rien ne change** : les comptes et journaux par défaut sont exactement les constantes historiques du FEC, et le fichier FEC produit est identique octet pour octet.

---

## Pour qui ?

| Profil | Ce qu’il fait ici |
|:--|:--|
| Expert-comptable / comptable | Aligne les comptes sur le plan du cabinet (sous-comptes 411100, 627100…), renomme les journaux, active ou non le lettrage. |
| Administrateur d’organisation | Donne les droits `accounting:manage` aux bonnes personnes. |
| Développeur | Lit la configuration effective avec `accountingConfig(organizationId)`. |

Permissions : `accounting:read` (administrateurs et membres) ; `accounting:manage` (administrateur plateforme, propriétaires et administrateurs d’organisation).

## Comptes par rôle

Chaque usage comptable de l’application est un **rôle** qui pointe vers un compte du plan :

| Rôle | Défaut | Utilisé par |
|:--|:--|:--|
| Clients (`receivable`) | 411000 | ventes, FEC |
| Fournisseurs (`payable`) | 401000 | achats, FEC |
| Ventes (`revenue`) | 706000 | ventes |
| Achats (`expense`) | 607000 | achats |
| TVA collectée / déductible | 445710 / 445660 | ventes / achats |
| Banque (`bank`) | 512000 | règlements sans compte bancaire précis |
| Frais bancaires | 627000 | banque (frais, versements Stripe) |
| Pertes / profits sur écarts | 658000 / 758000 | banque (perte/profit) |
| Pertes / gains de change | 666000 / 766000 | banque (change) |
| Escomptes accordés / obtenus | 665000 / 765000 | banque (escompte) |
| Compte d’attente | 471000 | banque (trop-perçu par défaut) |
| Virements internes | 580000 | banque |
| Avances clients / fournisseurs | 419100 / 409100 | banque (trop-perçu en avance) |
| Encaissements carte (`paymentClearing`) | 512000 | encaissements Stripe (un compte dédié, ex. 511500, isole les fonds jusqu’au versement) |

Chaque **compte bancaire** (module banque) a en plus son propre compte (défaut 512000) et son propre journal (défaut BQ).

## Plan comptable

Le plan affiché = comptes des rôles + comptes usuels proposés (honoraires 622600, loyers 613200, assurances 616000, télécoms 626000, intérêts 661600…) + comptes ajoutés par l’organisation, triés par numéro.

- **Ajouter / modifier** : numéro (3 à 20 caractères alphanumériques), libellé, classe (actif, passif, capitaux, produit, charge). Ajouter un numéro existant le renomme pour l’organisation.
- **Désactiver** un compte propre à l’organisation : il disparaît des listes (rôles, règles) ; l’historique est conservé.
- Un rôle qui pointe vers un compte inconnu ou désactivé revient à son défaut.

## Journaux

Ventes (VE), Achats (HA), Banque (BQ), Opérations diverses (OD) : code (≤ 10 caractères) et libellé modifiables. Le journal OD reçoit les écarts qui ne concernent pas un compte bancaire.

## Lettrage

Activé par défaut. Au rapprochement, la pièce (facture, avoir) et son règlement reçoivent le même code (A, B, …, Z, AA, AB…), attribué par une séquence par organisation (`document_sequences`, clé `accounting.lettering`) sans trou ni doublon même en concurrence. Le FEC renseigne alors `EcritureLet` et `DateLet` sur les lignes de comptes de tiers. Désactivé : ces colonnes restent vides (le lettrage reste visible dans l’application).

## Pour les développeurs

```ts
import { accountingConfig } from "@/core/accounting/service";
const config = yield* accountingConfig(organizationId); // { roles, journals, accounts, letteringEnabled }
config.roles.bankFees.code; // "627000" par défaut
```

- Domaine pur : `src/core/accounting/chart.ts` (`ACCOUNT_ROLES`, `DEFAULT_ROLE_ACCOUNTS`, `DEFAULT_JOURNALS`, `resolveAccountingConfig`).
- Service : `src/core/accounting/service.ts` (`accountingConfig`, `accountingService.saveSettings/upsertAccount/setAccountActive`, `nextLetteringCode`).
- Tables (migration 0058) : `accounting_settings` (rôles, journaux, lettrage), `accounting_accounts` (comptes de l’organisation).
- Toute modification est auditée (`audit_log`, module `accounting`).
- Actions : `actions.banking.saveAccountingSettings`, `upsertChartAccount`, `setChartAccountActive` (permission `accounting:manage`, organisation vérifiée).

Voir aussi `docs/banking.md` (rapprochement, grand livre banque) et `docs/fec.md`.
