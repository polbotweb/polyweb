# Module tax — TVA

Module `src/modules/tax` (généré par `pnpm module:new`, câblé dans `bootstrap.ts`, `src/actions`, permissions `tax`).

## Domaine (`domain/`, pur, Effect)

| Fichier | Rôle |
|---|---|
| `rules.ts` | `determineTax(ctx)` : régime applicable (national, B2C intra-UE origine/destination OSS, autoliquidation B2B, export) et mention légale (`legalMention`, fr/en/es/ar). Contrôle de format du n° de TVA intracommunautaire (préfixe `EL` pour la Grèce). |
| `rates.ts` | `DEFAULT_TAX_RATES` (taux normaux des 27 États membres + principaux taux réduits), `resolveTaxRate` (validité `validFrom` inclus / `validTo` exclu, priorité organisation → type de client explicite → validité la plus récente, aucune substitution silencieuse de catégorie : `TaxRateNotFoundError`), `computeDocumentTax` (totaux via `core/money`). |
| `accounting.ts` | `buildSaleEntry` (411 / 706 / 44571, avoir = sens inversé), `assertBalanced`, exports `toFec` (18 colonnes, `SIRENFECAAAAMMJJ.txt`, `\|`, CRLF, décimales à virgule, devise renseignée hors EUR) et `toAccountingCsv`. |

Régimes : même pays → TVA du pays ; vendeur UE / acheteur hors UE → export exonéré ; B2B intra-UE (n° de TVA valide obligatoire) → autoliquidation, TVA non facturée ; B2C intra-UE → pays du vendeur, ou de l'acheteur si `ossRegistered`.

## Données

Table `tax_rates` (migration `0029_tax_rates`) : surcharges des taux par défaut, par pays, catégorie (`standard`, `reduced`, `reduced-2`, `super-reduced`, `zero`, `exempt`), type de client (`B2B` / `B2C` / tous), période de validité et organisation (`null` = plateforme). Seuls les taux `PUBLISHED` (« Actif ») s'appliquent : `taxActiveRates(orgId)` à fusionner avec `DEFAULT_TAX_RATES` avant `computeDocumentTax`. Révisions dans `tax_rate_revisions`.

## Back-office

`/[lang]/admin/tax` : liste (recherche, facettes statut / pays / catégorie, vues enregistrées, actions groupées activer / brouillon / archiver / restaurer), `/new`, `/[id]/edit`. Permissions `tax:read|create|update|publish|delete`. Libellés : `modules/tax/i18n` (fr, en, es, ar).

## Tests

- `tests/unit/modules/tax-domain.test.ts` : régimes, résolution des taux, FEC / CSV.
- `tests/integration/tax-module.test.ts` : liste filtrée, facettes, surcharges actives appliquées au calcul.
- `tests/e2e/tax-admin.spec.ts` : création et modification d'un taux ; `tests/e2e/a11y.spec.ts` : axe sur `/fr/admin/tax` et `/fr/admin/tax/new`.
