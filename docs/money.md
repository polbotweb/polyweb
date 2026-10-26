# core/money — montants, devises, arrondis, TVA

Brique générique (`@/core/money`) pour tous les modules ERP/CRM (ventes, achats, logistique, réservations, boutique).

- **Montants** : `Money = { amountMinor, currency }` — entier sûr en unités mineures (centimes), devise ISO 4217 (`CURRENCY_EXPONENTS` : EUR 2, JPY 0, KWD 3…). Arithmétique exacte en BigInt, bornée à `Number.MAX_SAFE_INTEGER` (compatible colonnes `integer`/`bigint` Drizzle, ex. `price_minor`).
- **Effect** : les opérations faillibles (`fromDecimal`, `add`, `subtract`, `sum`, `compare`, `multiply`, `percentage`, `convert`, `allocate`, `parseCurrency`) renvoient un `Effect` typé (`CurrencyMismatchError`, `UnknownCurrencyError`, `InvalidAmountError`). `MoneySchema` (Effect Schema) pour décoder formulaires/JSON.
- **Arrondis** (`RoundingMode`) : `half-up` (commercial, défaut TVA FR/UE), `half-even` (bancaire), `half-down`, `up`, `down`, `ceil`, `floor`. `fromDecimal` refuse une précision excédentaire sauf si un mode est fourni.
- **Répartition** : `allocate(total, poids)` — plus fort reste, la somme des parts égale toujours le total (échéanciers, acomptes, remises globales).
- **Taxes** : `taxFromNet`, `grossFromNet`, `splitGross` (TTC → HT + taxe exacts) et `computeTaxTotals(lignes, { strategy })` avec ventilation par taux : `per-rate` (défaut, factures FR/UE : base cumulée puis taxe arrondie une fois par taux) ou `per-line`. Les taux (pays, catégorie, B2B/B2C, autoliquidation) relèvent du module Tax.
- **Affichage** : `formatMoney(m, locale)` via `Intl.NumberFormat`.

Tests : `tests/unit/core/money.test.ts`.
