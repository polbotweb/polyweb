# Multi-devises

Documents de vente émis dans n'importe quelle devise ISO 4217, avec contre-valeur figée dans la
devise de tenue de l'organisation (défaut EUR).

## Taux de change

- Table `exchange_rates` : 1 `base_currency` = `rate` `quote_currency` (décimal, 12 décimales max), par
  jour et source (`ecb` ou `manual`). `exchange_rate_settings` : devise de tenue par organisation.
- **Import BCE quotidien** : `POST /api/cron/fx-rates` (Bearer `CRON_SECRET`, déclenché par le
  planificateur externe chaque jour ouvré après 16 h CET). Réponse `200 {ok, days, imported, latest}`,
  `502 {ok:false, error:'ecb_fetch'|'ecb_feed'}` si le flux est injoignable ou invalide. Import idempotent (upsert).
- **Ajustements manuels** : `/admin/sales/fx` (permission ventes `issue`, actions auditées
  `FX_BASE_CURRENCY_SET`, `FX_RATE_SET`, `FX_RATE_DELETE`). Un taux manuel l'emporte sur la BCE à la
  même date ; un taux reste utilisable jusqu'à 7 jours (week-ends, jours fériés).
- Résolution : manuel direct ou inverse, sinon croisé via EUR à partir des taux BCE.

## Gel du taux à l'émission

À l'émission, chaque facture fige `exchange_rate`, `exchange_rate_date` et `net/tax/gross_base_minor`
(arrondi half-up). Un avoir reprend le taux de sa facture d'origine. La devise de tenue est verrouillée
dès le premier document émis. Les brouillons n'ont pas de taux.

## FEC

L'export FEC reste en EUR (devise de tenue requise : EUR). Pour un document en devise, les montants
Débit/Crédit sont la contre-valeur figée (lignes réconciliées sur les totaux figés, écart d'arrondi sur
la plus grosse ligne) et `Montantdevise` / `Idevise` portent le montant d'origine. Les règlements en
devise sont valorisés au taux du document.

## Tableau de bord

La section « Contre-valeurs en devise de tenue » du [tableau de bord](./erp-dashboard.md) agrège, toutes
devises confondues, les factures et avoirs émis sur la période en contre-valeur figée ; les documents
antérieurs sans taux figé sont signalés.

## Limites

- Pas d'écritures d'écart de change (666/766) sur les règlements : à saisir manuellement.
- Pas de réévaluation des créances en fin d'exercice.
- FEC impossible si la devise de tenue n'est pas EUR.
