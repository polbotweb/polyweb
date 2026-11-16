# Petites annonces

Tableau d'annonces **par site** : catégories arborescentes (seedées, traductions en 4 langues) →
annonces typées (offre / recherche, état, tarif) avec attributs dynamiques, photos, recherche
plein texte, favoris, recherches enregistrées, contact vendeur via la messagerie 1:1, pré-modération
optionnelle, expiration et renouvellement, notifications via `event_outbox`, 4 locales.

Le site public (`/{lang}/classifieds…`) et l'administration d'organisation (`/{lang}/admin/classifieds…`)
sont strictement séparés (mêmes habillages que les forums). Les pages de compte
(`/{lang}/classifieds/mine`, `/favorites`, `/saved-searches`) utilisent la barre latérale authentifiée.

## Tables (migration `0056_classifieds_core`)

| Table | Rôle |
| --- | --- |
| `classified_site_settings` | visibilité `public` / `members` / `org` (défaut public), pré-modération (défaut oui), durée, devise, photos, renouvellements |
| `classified_categories`, `classified_category_translations` | arbre par site, slug unique, noms en fr/en/es/ar |
| `classified_ads` | cycle `draft` / `pending` / `published` / `expired` / `sold` / `archived` + `moderation_status` distinct, `search_vector` généré + GIN |
| `classified_ad_media` | jusqu'à 8 images JPEG/PNG/WebP/AVIF, texte alternatif obligatoire |
| `classified_favorites`, `classified_saved_searches`, `classified_saved_search_filters` | favoris et alertes typées (pas de JSON fourre-tout) |
| `classified_inquiries` | lien annonce ↔ conversation, pour l'exception de messagerie |
| `attribute_definitions` (+ traductions, options, valeurs) | persistance générique `src/core/attributes` (premier consommateur : ce module) |

Le retour arrière supprime les déclencheurs, les tables `classified_*` puis `attribute_*`.
`pnpm exec drizzle-kit generate` ne produit rien une fois le schéma à jour.

## Attributs dynamiques (`src/core/attributes`)

Définitions typées (`text`, `number`, `integer`, `boolean`, `select`, `multiselect`, `date`),
libellés et options en 4 langues, bornes, unité, héritage le long de l'arbre de catégories
(le nœud le plus proche écrase une même clé). Validation Effect. Filtrables dans la recherche.
L'administration gère les définitions par catégorie.

**Suivi** : l'EAV historique du module services n'est pas migré dans cette livraison.

## Accès et cycle de vie

- Permissions `classifieds` : `read`, `create`, `update`, `delete`, `moderate`, `configure`.
  L'auteur gère ses propres annonces sans permission `create` (compte connecté suffisant).
- Visibilité du tableau : public / membres / organisation ; les gestionnaires voient toujours le tableau.
- Liste publique : `published` + `visible` (+ non échue). Les refus d'accès sont un `NOT_FOUND` indiscernable.
- Soumission : `pending` si pré-modération, sinon `published`. Renouvellement sous le plafond du site.
- Expiration : `POST /api/cron/classifieds` (secret `CRON_SECRET`) et relance 3 jours avant (`ReminderSource` `classifieds.expiring`).

## Contact vendeur

Publier une annonce permet toujours d'être contacté **au sujet de cette annonce** via la messagerie 1:1,
même si la préférence destinataire est `shared_org` ou `nobody`. Les blocages restent appliqués.
L'exception est enregistrée dans `classified_inquiries` et s'étend aux messages suivants de la même
conversation. Voir aussi [messaging.md](messaging.md).

## Notifications

Catégorie `classifieds` : `AD_APPROVED`, `AD_REJECTED`, `AD_EXPIRING`, `AD_EXPIRED`, `SAVED_SEARCH_MATCH`
(sur publication, destinataires des recherches enregistrées correspondantes). Pas de corps d'annonce
dans les charges.

## Hors périmètre

API publique, paiements / mises en avant, carte / géocodage, index global `search_documents`,
migration de l'EAV services.
