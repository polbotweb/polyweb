# Module Ventes (`src/modules/sales`)

Devis, factures et avoirs multi-tenant, avec lignes, TVA (`core/tax`), montants en unités mineures (`core/money`), numérotation sans trou (`core/numbering`), encaissements, relances et PDF (`core/documents`).

## Documents et statuts

| Type | Statuts | Numéro attribué | Schéma par défaut |
|---|---|---|---|
| Devis (`quote`) | DRAFT → SENT → ACCEPTED / REJECTED / EXPIRED ; ACCEPTED → CONVERTED ; DRAFT / SENT → CANCELLED | à l'envoi (SENT) | `DEV-{YYYY}-{seq:4}` |
| Facture (`invoice`) | DRAFT → ISSUED → PARTIALLY_PAID → PAID ; → CREDITED (avoirs) ; seul un brouillon s'annule | à l'émission (ISSUED) | `FA-{YYYY}-{seq:5}` |
| Avoir (`credit_note`) | DRAFT → ISSUED ; brouillon annulable | à l'émission | `AV-{YYYY}-{seq:5}` |

Les statuts PARTIALLY_PAID / PAID / CREDITED / CONVERTED sont **dérivés** (encaissements, avoirs, conversion) : l'interface ne les propose pas en transition manuelle. Un document émis est figé ; on le corrige par un avoir (plafonné au montant restant créditable).

## Domaine (pur, `domain/`)

`workflow.ts` (une table de transitions par type, `manualTargets`), `lines.ts` (totaux HT / TVA / TTC par ligne), `payments.ts` (`amountDue`), `credit.ts`, `reminders.ts` (échéance, relances à J+7 / 15 / 30), `numbering.ts`.

## Données

Tables `sales_documents`, `sales_document_lines`, `sales_payments`, `sales_reminders`, `sales_document_revisions`, `sales_document_locks` (migration `0031`).

## Actions (`actions.sales.*`)

`create`, `update`, `transition`, `convertQuote`, `createCreditNote`, `recordPayment`, `recordReminder`, `lock`, `unlock`, `bulk` (annuler / marquer expirés). Permissions `sales:create | read | update | delete | issue | payment`, vérifiées pour l'organisation du document (tenant) ; limites de débit par utilisateur.

## Administration

- `/{lang}/admin/sales` : liste filtrable (type, statut), actions groupées.
- `/{lang}/admin/sales/new?kind=quote|invoice` et `/{lang}/admin/sales/{id}/edit` : formulaire avec lignes dynamiques (brouillons uniquement).
- `/{lang}/admin/sales/{id}` : détail, totaux, transitions autorisées, conversion, avoir, relance, encaissement, documents liés.
- `/{lang}/admin/sales/{id}/pdf` : téléchargement du PDF — voir [documents-pdf.md](documents-pdf.md) (Chromium requis à l'exécution).

Traductions fr / en / es / ar (`i18n/`), interface RTL en arabe.

## Tests

`tests/unit/sales/domain.test.ts`, `tests/unit/sales/pdf-template.test.ts`, `tests/integration/sales-module.test.ts`, `tests/integration/sales-pdf.test.ts`.

## Paiement en ligne

Lien de paiement signé par facture (fiche facture, droit `payment`) → page publique
`/{lang}/pay/invoice/{id}` ; le webhook enregistre l'encaissement carte et recalcule le statut.
Tests : `tests/unit/sales/pay-link.test.ts`, `tests/integration/sales-payments.test.ts`.
Détails : [payments.md](payments.md).
