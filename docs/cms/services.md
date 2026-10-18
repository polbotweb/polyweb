# Services CMS — Architecture & Référence

## Positionnement

`Services` est le deuxième module métier de démonstration du CMS Atomic après Blog. Il utilise les mêmes contrats de module, de présentation et d'administration sans introduire une infrastructure CMS concurrente.

Le module est enregistré au bootstrap avec Blog et déclare ses capacités via `src/modules/services/module.ts`.

## Structure

```text
src/modules/services/
├── admin/
├── actions/
├── components/
│   ├── cards/
│   ├── lists/
│   ├── single/
│   └── ui/
├── domain/
├── i18n/
├── loaders/
├── permissions/
├── schema/
├── search/
├── seo/
├── utils/
├── validation/
├── capabilities.ts
├── module.ts
└── workflow.ts
```

La grammaire de présentation est identique au reste des modules :

```text
cards/
lists/
single/
ui/
```

avec des variantes métier (`default`, `compact`, `featured`, `horizontal`, `dense`, `search`, etc.).

## Domaine

Le modèle `services` représente une prestation avec :

- prestataire canonique `user` (`providerId`);
- statut éditorial `DRAFT`, `PUBLISHED`, `ARCHIVED`, `DELETED`;
- slug canonique et traductions par locale;
- image de couverture;
- prix en unités mineures et devise ISO 4217 à 3 lettres;
- durée positive;
- capacité maximale;
- indicateur de prestation mobile;
- indicateur `featured`;
- compteurs de vues et agrégats de notation;
- publication, création et mise à jour;
- verrou et utilisateur de dernière modification.

Les champs métier fortement structurants restent typés. Les attributs configurables ne remplacent pas ces champs.

## Localisation

Chaque ligne de `service_translations` représente une paire `service × locale`. Le module utilise les quatre locales Atomic :

```text
fr
en
es
ar
```

Les slugs de traduction sont localisés et soumis aux contraintes d'unicité tenant/locale du schéma.

## Taxonomie

Services possède ses propres catégories et tags localisés :

```text
service_categories
service_category_translations
service_tags
service_tag_translations
service_category_links
service_tag_links
```

Les catégories sont hiérarchiques. Toute modification de parent passe par l'invariant partagé d'acyclicité. Les catégories et tags référencés sont obligatoirement dans le même tenant que le service.

## Média

Le module référence `mediaFiles` pour ses couvertures et ses médias. Il n'existe pas de moteur de stockage concurrent. Les actions de média vérifient l'ownership tenant avant toute association.

## Disponibilités

`service_availability` représente les créneaux récurrents avec :

```text
dayOfWeek
startTime
endTime
timezone
maxParticipants
```

Les valeurs sont validées au niveau runtime et au niveau SQL pour garantir :

- jour entre 0 et 6;
- heure de fin strictement postérieure à l'heure de début;
- capacité positive lorsqu'elle est présente.

## SEO

Le contenu localisé porte les métadonnées de page et `service_seo` porte les métadonnées d'optimisation éditoriale complémentaires. Le score est calculé par une fonction canonique du module, sans second moteur de score caché.

## Workflow

Les opérations de cycle de vie sont explicites :

```text
DRAFT      → PUBLISHED | ARCHIVED | DELETED
PUBLISHED  → DRAFT | ARCHIVED | DELETED
ARCHIVED   → DRAFT | DELETED
DELETED    → DRAFT
```

`updateService` ne change pas le statut ni la date de publication. Ces opérations passent exclusivement par les Actions lifecycle.

Chaque transition effectue les contrôles d'autorisation et de tenant, applique l'invariant de transition, met à jour les métadonnées, journalise l'action et invalide le cache.

## Duplication

`duplicateService` crée un nouvel objet `DRAFT` avec une nouvelle identité. Sont copiés les éléments éditoriaux pertinents :

- traductions;
- catégories et tags;
- média;
- disponibilités;
- SEO;
- contenu éditorial.

Ne sont pas clonés :

- état de publication;
- vues et analytics;
- favoris;
- réactions;
- commentaires;
- avis;
- notifications;
- locks;
- historique complet des révisions.

La nouvelle ressource reçoit sa propre première révision de création.

## Révisions et verrouillage

Les révisions sont non destructives. Une restauration applique une révision au document courant et écrit une nouvelle révision retraçant cette restauration. L'historique existant n'est jamais remplacé.

Les locks sont liés au service, à l'utilisateur et à la session et possèdent une expiration. Un autre utilisateur ne peut pas prendre un lock actif sans que celui-ci soit expiré.

## Engagement et modération

Services active les capacités selon les besoins du domaine :

```text
favorites
reactions
reviews
review helpful votes
comments
reports
moderation
notifications
```

Les réactions suivent une sémantique mono-réaction par utilisateur et service. Le changement de type remplace l'état précédent.

Les signalements sont à cible unique (`service` ou `comment` ou `review`) au niveau SQL. Les cibles secondaires sont vérifiées contre le service avant insertion ou résolution.

Les avis approuvés alimentent les agrégats `ratingAverage100` et `ratingCount` du service.

## Notifications

Les notifications sont tenant-scoped via leur service cible. Les types de commentaire exigent un `commentId`, les types d'avis exigent un `reviewId`. Les notifications auto-générées pour l'auteur de l'action sont supprimées lorsque l'acteur et le destinataire sont identiques.

## Recherche

Services déclare une définition `SearchResourceDefinition` dans `src/modules/services/search/` avec des champs explicitement :

```text
searchable
filterable
sortable
```

La recherche reste branchée sur l'architecture PostgreSQL/SSR d'Atomic et ne crée pas de moteur `%query%` parallèle.

## Administration globale et organisationnelle

### Global

```text
/{lang}/admin/services
/{lang}/admin/services/new
/{lang}/admin/services/{id}/edit
```

### Organisation

```text
/{lang}/organizations/{slug}/admin/services
/{lang}/organizations/{slug}/admin/services/new
/{lang}/organizations/{slug}/admin/services/{id}/edit
```

Les deux surfaces utilisent le même Admin Resource contract et les mêmes loaders, mais avec un tenant explicite dans le contexte organisationnel.

La liste admin prend en charge recherche, statut, catégorie, tag, prestataire, mobile, locale, tri et pagination. Les statistiques sont calculées sur l'ensemble du tenant et non sur la page affichée.

## Administration des catégories et tags

Les taxonomies Services sont gérées comme sous-ressources du module. Les actions valident le tenant, les parents et les cycles avant écriture. La suppression d'une catégorie qui possède des enfants est refusée explicitement.

## Sécurité et tenancy

Chaque mutation suit la chaîne :

```text
validate
→ resolve tenant
→ permission check
→ referenced-resource ownership checks
→ business invariant
→ transaction
→ audit
→ cache invalidation
```

Aucun service, média, tag, catégorie, commentaire, avis ou rapport appartenant à un autre tenant ne doit pouvoir être associé par une action Services.

## i18n et RTL

Les textes du module résident dans `src/modules/services/i18n/` pour `fr`, `en`, `es`, `ar`. L'interface arabe doit fonctionner avec le RTL fourni par Atomic. Les composants ne doivent pas introduire une direction ou une traduction concurrente.

## Tests attendus

La couverture du module doit protéger au minimum :

- contrat du module;
- contrat Admin Resource;
- validation des locales, slugs, prix et disponibilités;
- transitions lifecycle légales et illégales;
- duplication;
- restauration de révision;
- verrouillage;
- cycle de catégories;
- isolation tenant;
- média et ownership;
- réactions mono-réaction;
- cible unique des rapports;
- cohérence des notifications;
- agrégats de reviews;
- visibilité publique des seuls services publiés;
- routes globales et organisationnelles.

Les tests E2E doivent utiliser la même matrice de locales et de tenancy que le Blog lorsque les parcours sont communs.

## Limites architecturales

Services n'introduit pas :

```text
blog_media
blog_authors
service_media_engine
service_search_engine
service_workflow_engine
service_notification_engine
service_audit_engine
universal_content_table
REST admin parallèle
```

Les futurs domaines `Courses`, `Formations`, `Shop` ou `Events` doivent consommer les mêmes primitives et ajouter uniquement leur logique métier spécifique. Les paiements, commandes, inventaires, réservations et inscriptions restent hors du CMS éditorial.