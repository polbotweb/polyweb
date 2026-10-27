# Exports FEC mensuels (`src/modules/sales`)

Fichier des écritures comptables (FEC, art. A47 A-1 du LPF) généré **par tenant et par mois** à partir
des documents de vente et des règlements. Domaine pur : `domain/fec.ts` ; orchestration :
`services/fecExport.service.ts` ; table `sales_fec_exports` (migration `0044`).

## Contenu

- **VE** (ventes) : une écriture par facture / avoir numéroté émis dans la période (ni brouillon ni annulé) —
  411 client, 706 produits HT et 44571 TVA collectée par taux ; avoir = sens inversé.
- **BQ** (banque) : une écriture par encaissement (512 / 411) ou remboursement (sens inversé) daté du mois.
- Tri déterministe (date, journal VE avant BQ, pièce, identifiant) ; `EcritureNum` = `<journal><AAAAMM><seq:5>`.
- Chaque écriture est équilibrée, totaux débit = crédit vérifiés ; EUR uniquement (autre devise → échec motivé).
- Fichier `<SIREN>FEC<AAAAMMJJ>.txt` (date de clôture de la période), 18 colonnes, séparateur `|`, fins de ligne
  CRLF, encodage ISO 8859-15 ; les séparateurs et sauts de ligne des libellés sont neutralisés.
- Le SIREN vient du profil vendeur du tenant (`legalId`, schéma `0002`) ; sans SIREN → export `FAILED` motivé.

## Cycle de vie

| Statut | Signification |
|---|---|
| `PENDING` | génération en cours (verrou atomique par tenant et période) ; reprise si périmée (> 15 min) |
| `READY` | fichier stocké, empreinte SHA-256 et totaux enregistrés — **figé**, jamais régénéré |
| `FAILED` | erreur consignée ; relance automatique après 60 min (mois précédent) ou manuelle forcée |

- **Cron** : `/api/cron/publish` (tâche existante) appelle `fecExportService.runMonthly` : le mois clos
  précédent est généré pour chaque tenant (plateforme incluse), par lots de 20 ; une seconde passe est sans effet.
  Les mois plus anciens se génèrent depuis l'administration.
- **Audit** : génération (`SALES_FEC_GENERATE`, action ou cron) et téléchargement (`SALES_FEC_DOWNLOAD`) journalisés.

## Stockage privé

Clé `fec/<organisation|platform>/<AAAA-MM>/<fichier>`, jamais d'URL publique (`src/lib/storage/private.ts`).

| Variable | Rôle |
|---|---|
| `PRIVATE_STORAGE_DIR` | pilote `local` : répertoire hors `public/` (défaut `storage/private`, volume Docker dédié) |
| `S3_PRIVATE_BUCKET` | pilote `s3` / `r2` : bucket privé distinct du bucket média (obligatoire) |
| `S3_PRIVATE_PREFIX` | préfixe optionnel des clés dans le bucket privé |

Une configuration privée absente ou invalide produit un export `FAILED` — jamais de repli vers le stockage public.

## Administration

- `/{lang}/admin/sales/fec` (droit `sales:read`) : liste de tous les tenants — période, tenant, statut (erreur),
  nombre d'écritures et de lignes, totaux, empreinte SHA-256, date, auteur (ou cron), lien de téléchargement.
  Formulaire de génération d'un mois clos (droit `sales:issue`, tenant plateforme).
- `/{lang}/admin/sales/fec/{id}/download` (droit `sales:read` sur le tenant de l'export) : fichier
  `text/plain; charset=ISO-8859-15`, `Cache-Control: private, no-store` ; empreinte revérifiée (fichier altéré → 500).

## Tests

`tests/unit/modules/sales-fec.test.ts` (domaine, format, encodage), `tests/integration/sales-fec.test.ts`
(génération, immutabilité, reprise, cron, route, action, audit), `tests/integration/storage/s3.test.ts`
(bucket privé), `tests/e2e/sales-fec.spec.ts` (liste, téléchargement, période refusée) ; page couverte par Lighthouse et Pa11y (seed `tests/a11y/setup.ts`).
