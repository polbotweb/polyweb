# Paiements en ligne — `core/payments`

Brique **générique** (cœur) de paiement en ligne, réutilisable par tout module : acompte de
réservation (`bookings`), lien de paiement de facture (`sales`), et demain boutique. Fournisseur :
**Stripe** via le SDK officiel (`stripe`), ou un fournisseur **mock** signé pour le
développement et les tests. Montants : `Money` de [`core/money`](money.md) (unités mineures ISO 4217).

## Configuration (environnement uniquement)

| Variable | Rôle |
| --- | --- |
| `PAYMENTS_ENABLED` | `true` pour activer. Sinon : webhook 404, aucun lien de paiement, réservations sans acompte. |
| `PAYMENT_PROVIDER` | `stripe` ou `mock` (défaut `mock`). |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Clés Stripe (obligatoires si `stripe`). Jamais en base, jamais dans les logs. |
| `PAYMENTS_MOCK_SECRET` | Secret HMAC du fournisseur mock. |
| `PAYMENTS_ALLOW_MOCK` | En production, le mock est refusé sauf `true` (recette). |
| `POLYWEB_SIGNING_SECRET` | Signature des liens de paiement de facture (défaut : `BETTER_AUTH_SECRET`). |

La résolution du fournisseur est paresseuse (`PaymentGateway`, service Effect) : une clé
absente n'empêche pas le démarrage, seul l'usage échoue (`PaymentsUnavailableError`).

**Réglages par tenant** (`payment_settings`, `organization_id` nul = plateforme) : activation,
devise par défaut, compte Stripe connecté, libellé de relevé, durée de validité d'un lien
(bornée à [30 min, 24 h], limites Stripe Checkout).

## Modèle

- `payments` : un paiement par tentative, `reference = <purpose>:<subjectId>`, statut
  (`pending` → `succeeded` | `failed` | `expired` | `cancelled` ; `refunded`), montant/devise,
  identifiants fournisseur, échéance, clé d'idempotence.
- `payment_events` : trace d'idempotence unique `(provider, event_id)`.
- Transitions autorisées : `transitions.ts` (`canTransitionPayment`).

## API (Effect v4)

| Fonction | Rôle |
| --- | --- |
| `startCheckout(input)` | Crée ou **réutilise** un paiement `pending` valable pour la même référence et le même montant ; renvoie l'URL hébergée. Clé d'idempotence transmise au fournisseur. |
| `startPaymentIntent(input)` | Variante Payment Intent (paiement intégré, `clientSecret`). |
| `handleWebhook(rawBody, headers)` | Signature vérifiée sur le **corps brut** → une transaction : trace `payment_events`, verrou `FOR UPDATE` du paiement, contrôle montant/devise, transition, réaction du module. Doublon = sans effet. |
| `expireDuePayments(now)` | Cron : paiements échus → `expired`, réaction `onExpired`, puis balayage propre à chaque module (`sweep`). |
| `registerPaymentPurpose(handler)` | Un module déclare son objet (`purpose`) et ses réactions `onSucceeded` / `onFailed` / `onExpired` / `sweep`, exécutées **dans la transaction du webhook**. |

Routes : `POST /api/payments/webhook` (corps ≤ 256 Kio ; 200 traité/doublon, 400 signature,
404 désactivé, 422 montant incohérent, 500 → le fournisseur réessaie sans risque) et
`/api/cron/payments-expire`.

Règle : une réaction métier **ne fait jamais échouer** un webhook valide pour une règle métier
(facture déjà soldée, réservation annulée…) : l'anomalie est journalisée pour remboursement
manuel. Seules les erreurs base remontent (rollback, le fournisseur réessaie).

## Usages

### Acompte de réservation (`bookings`, objet `booking`)

- Montant et devise configurables par ressource (back-office, saisie décimale exacte).
- Si les paiements sont actifs et l'acompte > 0, la demande publique est créée `REQUESTED`
  avec une échéance de 60 min et le visiteur est redirigé vers le paiement ; il peut aussi
  payer depuis sa page de gestion.
- Payé → `CONFIRMED` (numéro RES attribué). Non payé à l'échéance (+10 min de grâce) →
  `EXPIRED` (statut système, non sélectionnable à la main) et le créneau est libéré.
- Payé après annulation/expiration : `depositPaidAt` renseigné, erreur journalisée (remboursement).

### Lien de paiement de facture (`sales`, objet `sales-invoice`)

- Lien `/{lang}/pay/invoice/{id}?t=…` : jeton HMAC-SHA256 (192 bits) lié à la facture,
  comparaison à temps constant ; affiché sur la fiche facture aux détenteurs du droit
  `payment`, uniquement si la facture est payable (émise ou partiellement payée, restant dû > 0).
- Page publique : `no-store`, `noindex`, `referrer same-origin` ; la session fournisseur n'est
  créée **que sur POST** (un scanner de liens n'en crée pas). Montant = restant dû.
- Payé → encaissement `card` (référence fournisseur, dédoublonné) et statut recalculé
  (`PARTIALLY_PAID` / `PAID`) dans la transaction du webhook. Trop-perçu : journalisé.

### Boutique

Le module boutique n'a ni panier ni commandes : le paiement de commande attend une décision
d'architecture (modèle panier/commande) et n'est pas implémenté ici.

## Tests

Aucun appel réel à Stripe : le SDK est remplacé par un client simulé
(`tests/unit/payments/providers.test.ts`, événements dans `tests/fixtures/payments`) et les
tests d'intégration utilisent le fournisseur mock signé
(`tests/integration/payments.test.ts`, `tests/integration/sales-payments.test.ts`).
