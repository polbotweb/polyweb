# Abonnements (`src/modules/subscriptions`)

Abonnements récurrents vendus par la plateforme ou une organisation, payés via le fournisseur de
paiement (`core/payments`, Stripe en production, fournisseur `mock` en test). L'état fait foi côté
fournisseur : la base locale est un miroir mis à jour par webhooks. **Aucun appel réel à Stripe en
test ou en CI** ; les secrets viennent uniquement de l'environnement.

## Tables

| Table | Rôle |
| --- | --- |
| `subscription_plans` | Formules (nom, slug unique par tenant, catégorie de TVA, nature de la prestation, ordre, active). |
| `subscription_prices` | Tarifs d'une formule : devise, montant **TTC** en unités mineures, période (`day`…`year`) × 1–12, jours d'essai 0–730. |
| `subscriptions` | Abonnements clients : formule, tarif, compte propriétaire (`customer_user_id`), pays/type client, statut, identifiants fournisseur (abonnement, client, élément, produit), fin de période, résiliation programmée. |
| `subscription_categories`, `subscription_category_links`, `subscription_category_translations` | Taxonomie de catégories propre au module (actions `subscriptions.categories*`, comme tout module). Pas encore d'écran dédié dans l'admin. |
| `sales_documents.provider_invoice_id` | Référence (unique) de la facture fournisseur d'une période. |

Statuts : `incomplete` (souscription démarrée, non payée), `trialing`, `active`, `past_due`,
`unpaid`, `paused`, `cancelled`. Les règles pures sont dans `domain/lifecycle.ts`
(`canCancel`, `canResume`, `canChangePrice`, `validPrice`, `providerPatch`).

## Parcours

- **Catalogue public** `/{lang}/subscriptions` : formules actives de la plateforme ayant au moins un
  tarif actif. Un client connecté choisit un tarif et son pays (ISO) puis est redirigé (POST
  `/{lang}/subscriptions/checkout`, limité à 5/min) vers la page de paiement du fournisseur ; retour
  avec `?status=success|cancelled|error`. Visiteur : lien de connexion.
- **Portail client** `/{lang}/account#subscriptions` : abonnements du compte (hors `incomplete`),
  résiliation en fin de période et reprise par formulaires POST
  (`/{lang}/account/subscriptions/{id}/cancel|resume`). Sans session : 401 ; abonnement d'autrui
  ou inexistant : 404 (pas d'énumération, aucun appel fournisseur).
- **Admin** `/{lang}/admin/subscriptions` (permission `subscriptions`) : formules (création,
  édition), tarifs (création, activation/désactivation — un tarif n'est jamais modifié, on en crée
  un nouveau), liste et fiche des abonnements : résiliation / reprise, changement de tarif (même
  devise, prorata optionnel). Toutes les actions sont auditées.

## Webhooks et facturation

`registerSubscriptions()` (bootstrap) branche `handleSubscriptionEvent` via
`setSubscriptionEventSink`. Une transaction par événement :

1. rattachement par métadonnée `subscription_id` (si cohérente) sinon par identifiant fournisseur ;
   inconnu → `unmatched` ;
2. dédoublonnage générique `payment_events` (`recordPaymentEvent`) → `duplicate` ;
3. mise à jour du miroir (`providerPatch`) puis, par facture fournisseur :
   - `invoice_paid` : **une facture Sales par période** (`provider_invoice_id` unique, rejouable),
     émise puis soldée par un encaissement carte référencé ;
   - `invoice_failed` : facture Sales émise à échéance immédiate, abonnement `past_due` ; le
     **recouvrement (dunning)** repose sur les relances Sales existantes (factures échues, tâche
     planifiée) en plus des nouvelles tentatives du fournisseur.

Refus métier (devise inconnue, montant non représentable…) : journalisés, réponse 200 (`unchanged`) ;
seule une erreur base de données remonte pour que le fournisseur rejoue l'événement.

Remboursements : manuels, par avoir Sales sur la facture concernée.

## Tests

- Unitaires : `tests/unit/subscriptions/lifecycle.test.ts`.
- Intégration (base réelle, fournisseur mock) : `tests/integration/subscriptions.test.ts`.
- E2E : `tests/e2e/subscriptions.spec.ts` (admin, catalogue, portail, IDOR) et `a11y.spec.ts`.
- pa11y / Lighthouse : catalogue public, admin (liste, formule, abonnement) et portail, données
  seedées par `tests/a11y/setup.ts` (formule `a11y-plan`, abonnement fictif sans fournisseur).
