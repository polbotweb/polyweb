# Remboursements — `core/refunds`

Brique **générique** (cœur) de remboursement total ou partiel d'un paiement
[`core/payments`](payments.md), pour tout module : boutique (`shop-order`), réservations
(`booking`), factures (`sales-invoice`) et modules générés par `pnpm module:new`. Montants :
`Money` de [`core/money`](money.md) (unités mineures ISO 4217). Aucun secret en base : le
fournisseur (Stripe ou mock) est celui de `PaymentGateway` (variables d'environnement).

## Modèle

- `refunds` : une ligne par demande, rattachée au paiement (`payment_id`, `reference`
  `<purpose>:<subjectId>`, `organization_id`), montant > 0 (contrainte SQL), devise, motif
  (`requested_by_customer`, `duplicate`, `fraudulent`, `return`, `cancellation`, `other`),
  note, auteur (`requested_by`, nul si initié chez le fournisseur), identifiant fournisseur,
  `failure_reason`, horodatages.
- Unicité : `idempotency_key` ; `(provider, provider_refund_id)`.
- Statuts : `pending` → `succeeded` | `failed` | `cancelled` (`transitions.ts`,
  `canTransitionRefund`). Une confirmation tardive d'un `failed` reste acceptée.
- Paiement : `paid` → `partially_refunded` → `refunded` (seuls `paid` et `partially_refunded` sont remboursables).
- Migration : `0041_core_refunds.sql`.

## Règles

- **Plafond** : `capturé − remboursé − en cours` (`committed` = `succeeded` + `pending`), calculé
  sous verrou `FOR UPDATE` du paiement : deux demandes concurrentes ne dépassent jamais le
  capturé (`RefundAmountExceededError`).
- **Devise et précision** : devise du paiement uniquement ; montant saisi converti par
  `fromDecimal` (`InvalidAmountError` si précision invalide).
- **Idempotence** : clé fournie par l'appelant (`admin:<userId>:<nonce>` pour le formulaire,
  `rma:<id>` pour un retour…). Même clé + même demande = même remboursement ; même clé +
  demande différente = `RefundIdempotencyConflictError`. Clé fournisseur : `refund:<id>`.
- **Tenant** : `organizationId` de l'appelant = celui du paiement, sinon `RefundNotAllowedError`.
- **Module** : `validate` peut refuser AVANT l'appel fournisseur (ex. Sales : montant
  atteignable exactement par un avoir).

## API (Effect v4)

| Fonction | Rôle |
| --- | --- |
| `requestRefund(input)` | 1) transaction : verrou, contrôles, ligne `pending` ; 2) appel fournisseur HORS transaction ; 3) transaction : issue appliquée (statut du paiement + réaction du module, ensemble). |
| `applyRefundEvent(provider, event)` | Webhooks `refund.created|updated|failed` (branchés par `registerRefundsCore` via `setRefundEventSink`) : même application, idempotente (`payment_events`). Un remboursement initié depuis le tableau de bord du fournisseur crée sa ligne (`external:<provider>:<id>`, `metadata.origin = provider`). |
| `resumeStaleRefunds(now)` | Cron `/api/cron/payments-expire` : rejoue avec la même clé les appels incertains (`pending` sans identifiant fournisseur depuis 10 min) ; au-delà de 23 h (expiration des clés Stripe) → `failed` (`provider_unreachable`). |
| `refundablePaymentsFor(reference)` | Paiements d'un objet et résumé (`captured`, `refunded`, `pending`, `remaining`). |
| `refundsForPayment(id)`, `listRefunds(orgId, filter)` | Lecture, filtrée par tenant. |

## Réactions des modules

`registerRefundHandler({ purpose, validate?, onSucceeded?, onFailed? })`, appelé au démarrage
(`src/core/modules/bootstrap.ts`). Les réactions s'exécutent DANS la transaction qui constate
l'issue ; une règle métier non satisfaite se journalise sans échouer (l'argent est déjà rendu),
seule une `DbError` annule (le webhook est rejoué).

| Objet | Réaction |
| --- | --- |
| `shop-order` | Commande payée non expédiée : remise en stock Logistics (mouvements `return`, `RET-<n°>`) — tout le reste si total, sinon `metadata.restockLines` ; `metadata.restock = false` la désactive. Total → commande `REFUNDED`. Une commande livrée n'est PAS remise en stock automatiquement (retour RMA). |
| `booking` | Total → réservation `CANCELLED` (si la transition est permise) ; partiel sans effet. |
| `sales-invoice` | Avoir émis (numéroté) + encaissement négatif `card` (référence = remboursement) ; facture `PAID` / `CREDITED`. |
| module généré | `src/modules/<domaine>/refunds.ts` : objet `<domaine>`, `validate` (objet existant dans l'organisation du paiement), `onSucceeded` à compléter. |

## Administration

`RefundPanel` (`src/components/refunds`) sur les fiches commande, réservation et facture :
capturé / remboursé / en cours / restant, historique, formulaire SSR sans JavaScript (compatible
CSP) posté sur `/<lang>/admin/refunds` (`handleRefundPost`, `src/core/refunds/admin.ts`) :

- permission `payment:refund` revérifiée sur l'organisation du paiement
  (`requireTenantPermission`), lecture du panneau soumise à `payment:read` ;
- limite de débit `payment:refund` (10 / min / utilisateur) ;
- nonce de formulaire → clé `admin:<userId>:<nonce>` (double soumission sans effet) ;
- retour borné aux pages d'administration (`/<lang>/admin/...`), sinon `/<lang>/admin` ;
- issue affichée par `?refund=<clé>` (libellés fr, en, es, ar : `src/core/refunds/i18n.ts`).

Journal d'audit : `REFUND_REQUEST`, `REFUND_SUCCEEDED`, `REFUND_FAILED`, `REFUND_EXTERNAL`.

## Tests

Aucun appel réel à Stripe : client simulé (`tests/unit/core/payments.test.ts`, fixtures
`tests/fixtures/payments`) et fournisseur mock signé
(`tests/integration/refunds.test.ts` : total, partiel, plafond, idempotence, tenant, refus,
en attente puis webhook, remboursement externe, reprise cron, avoirs Sales, réservations,
formulaire d'administration).
