# Tableau de bord ERP

Vue de pilotage en lecture seule du back-office : chiffre d'affaires (facturé, encaissé, restant
dû) par période — commandes boutique comprises, **sans double comptage** —, marges, niveaux de
stock, alertes de stock bas et valorisation.
Code : `src/modules/dashboard/{domain,services,admin,i18n}`, composant
`src/components/dashboard/ErpDashboard.astro`, page `src/pages/[lang]/admin/dashboard.astro`.
Effect v4 de bout en bout ; aucune table ni migration propre (agrégats SQL sur
[`sales`](sales.md), [`shop`](shop-checkout.md), [`purchasing`](purchasing.md) et
[`logistics`](logistics.md)).

## Accès et sécurité

| Élément | Règle |
| --- | --- |
| Page `/<locale>/admin/dashboard` | Permission `sales:read` (sinon redirection habituelle du back-office). |
| Section stock | Permission supplémentaire `logistics:read`, revérifiée côté serveur ; sans elle, la section n'est ni calculée ni rendue. |
| Tenant | Plateforme (`organization_id IS NULL`) ; toutes les requêtes sont filtrées par tenant (prédicat `IS NULL` / `=` pour utiliser les index). |
| Cache | `Cache-Control: private, no-store`. |
| Erreurs | Saisie invalide → valeur par défaut + message (`role="alert"`, `aria-invalid`) ; indisponibilité de la base → bandeau « données indisponibles », jamais de 500. |

## Filtres (formulaire GET, sans JavaScript)

| Paramètre | Défaut | Contrôle |
| --- | --- | --- |
| `from`, `to` | 1er janvier de l'année en cours → aujourd'hui (jours UTC) | Dates ISO valides, `from ≤ to`, au plus 120 périodes. |
| `granularity` | `month` | `month`, `quarter` ou `year`. |
| `currency` | `EUR` | Code ISO 4217 connu ; seuls les documents dans cette devise sont agrégés (pas de conversion). |
| `threshold` | `DASHBOARD_LOW_STOCK_THRESHOLD` (sinon 5) | Entier 0–100 000. |

## Indicateurs

- **CA HT** = factures comptées (`ISSUED`, `PARTIALLY_PAID`, `PAID`, `CREDITED`) par date
  d'émission − avoirs émis + commandes boutique payées **non rattachées à une facture comptée**
  (par `paid_at`). Une commande facturée n'est donc comptée qu'une fois, via sa facture.
- **Encaissé** = paiements enregistrés sur les factures + TTC des commandes boutique payées.
- **Restant dû / en retard** : au jour J (indépendant de la période), factures ouvertes et
  échues ; nombre de commandes boutique en attente de paiement.
- **Marge boutique** = CA HT boutique − coût des ventes (coût moyen pondéré actuel × quantités,
  ligne de livraison exclue ; les unités sans coût connu sont signalées).
- **Marge brute approchée** = CA HT − achats reçus HT de la période (réceptions × prix unitaire
  de la ligne de commande fournisseur, même devise).

## Stock

- Disponible = niveau − réservations actives ; alerte quand disponible ≤ seuil.
- Valorisation = niveau positif × coût moyen pondéré des réceptions (arrondi à l'unité mineure).
- Seuil global (variable d'environnement + paramètre `threshold`) : pas de point de commande par
  article, pour éviter une migration.
- Liste plafonnée à 5 000 articles (indicateur « tronqué » affiché le cas échéant).

## Accessibilité (WCAG 2.2 AAA)

Tableaux de données plutôt que graphiques (`caption`, `th scope`, total en `tfoot`), cartes
d'indicateurs en `dl`, libellés de période via `Intl` en UTC, 4 locales dont l'arabe RTL. La page
est auditée par Pa11y et Lighthouse (`.pa11yci.cjs`, `lighthouserc.cjs`, URL admin).

## Configuration

| Variable | Rôle |
| --- | --- |
| `DASHBOARD_LOW_STOCK_THRESHOLD` | Seuil d'alerte de stock bas par défaut (entier 0–100 000, défaut 5). |

## Tests

- Unitaires : `tests/unit/dashboard/period.test.ts`, `tests/unit/dashboard/metrics.test.ts`.
- Intégration (base réelle) : `tests/integration/erp-dashboard.test.ts` — agrégats, absence de
  double comptage facture/commande, avoirs, coûts moyens, isolation des tenants.
