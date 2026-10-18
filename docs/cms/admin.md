# CMS Admin — Architecture & Référence

## Vue d'ensemble

Atomic Admin est un système de gestion de ressources utilisé par les capacités CMS natives et par les modules métier. Blog et Services sont les deux premiers consommateurs complets du modèle.

Le principe est :

```text
Resource
→ list
→ search
→ filters
→ sort
→ pagination
→ stats
→ create / edit / detail
→ explicit actions
→ audit
```

Les primitives d'interface restent génériques. Les règles métier, permissions et Actions restent dans le module concerné.

## Core administratif

Les contrats et primitives partagés résident sous `src/core/admin` et dans les composants Admin existants.

Le Resource Contract décrit :

- management capabilities : list, search, filters, sort, pagination, stats;
- editorial actions : create, read, update, duplicate, publish, unpublish, archive, restore, delete;
- typed filter/sort definitions;
- presentation variants;
- permission namespace.

La compatibilité resource/module est vérifiée à l'enregistrement. Les capacités dépendantes d'une autre capacité ne peuvent pas être annoncées incohéramment.

Bulk actions restent opt-in : elles ne doivent être exposées que lorsqu'une implémentation batch sûre existe dans le domaine.

## Global Admin routes

Les ressources CMS globales sont sous `src/pages/[lang]/admin/`.

En plus des surfaces existantes pour site, pages, navigation, thème, utilisateurs et organisations, les deux modules métier exposent :

| Route | Module | Description |
| :-- | :-- | :-- |
| `/{lang}/admin/blog` | Blog | Resource list, filtres, stats, actions |
| `/{lang}/admin/blog/new` | Blog | Création |
| `/{lang}/admin/blog/[id]/edit` | Blog | Édition |
| `/{lang}/admin/services` | Services | Resource list, filtres, stats, actions |
| `/{lang}/admin/services/new` | Services | Création |
| `/{lang}/admin/services/[id]/edit` | Services | Édition |

Ces pages sont SSR et utilisent les permissions du domaine plutôt qu'une garde métier codée uniquement dans le frontmatter.

## Organization Admin routes

Les ressources tenant-scoped exposent également :

| Route | Module | Description |
| :-- | :-- | :-- |
| `/{lang}/organizations/{slug}/admin/blog` | Blog | Administration Blog de l'organisation |
| `/{lang}/organizations/{slug}/admin/blog/new` | Blog | Création dans l'organisation |
| `/{lang}/organizations/{slug}/admin/blog/[id]/edit` | Blog | Édition dans l'organisation |
| `/{lang}/organizations/{slug}/admin/services` | Services | Administration Services de l'organisation |
| `/{lang}/organizations/{slug}/admin/services/new` | Services | Création dans l'organisation |
| `/{lang}/organizations/{slug}/admin/services/[id]/edit` | Services | Édition dans l'organisation |

La surface organisationnelle réutilise le même domain code et les mêmes Actions que la surface globale. Le tenant est résolu à partir de l'organisation et chaque référence métier est revalidée dans ce tenant.

## Blog resource

Blog expose :

```text
list / search / filters / sort / pagination / stats
create / read / update / duplicate / publish / unpublish / archive / restore / delete
```

Filtres : recherche, statut, catégorie, tag, auteur, featured, sticky, locale de traduction.

Tri : création, mise à jour, publication, titre et vues.

Les statistiques sont calculées à l'échelle de la ressource/tenant, pas sur la seule page courante.

La liste reste responsive : les métadonnées secondaires se replient sur les petits écrans au lieu de forcer une table illisible.

## Services resource

Services utilise le même Resource Contract.

```text
list / search / filters / sort / pagination / stats
create / read / update / duplicate / publish / unpublish / archive / restore / delete
```

Filtres : recherche, statut, catégorie, tag, provider, mobile, featured, locale.

Tri : création, mise à jour, publication, titre, prix, note moyenne et vues.

Les statistiques sont globales au tenant : total, publiés, brouillons, featured, vues et agrégats de reviews/commentaires disponibles au loader.

## Shared form architecture

Les formulaires de module s'appuient sur les primitives partagées :

```text
AdminFormShell
AdminFormSection
AdminFormTabs
AdminFormFooter
AdminFormDirtyGuard
AdminFormActions
```

Le Blog et Services utilisent un dirty-state protection pour éviter la perte silencieuse d'édition lors des navigations.

Les formulaires doivent utiliser des payloads typés correspondant aux Actions. `Record<string, unknown>` et les casts `as never` ne constituent pas des contrats valides de module.

## Shared UX primitives

Le design system existant reste l'autorité pour :

- buttons and menus;
- tabs;
- dialogs / sheets / drawers;
- inputs / select / checkbox;
- pagination;
- toast/feedback;
- focus and keyboard interaction;
- RTL behavior;
- responsive primitives.

Le module ajoute uniquement ses présentations métier.

## Filters and URL state

Les filtres admin sont décrits par des contrats typés et destinés à être transportés dans l'URL afin de conserver :

- SSR déterministe;
- partage/bookmark;
- navigation arrière;
- état de recherche reproductible.

Les modules restent responsables de traduire ce contrat vers leurs loaders typés.

## Media

Les ressources Blog et Services utilisent le Media Core et le MediaPicker partagés. Les mutations vérifient l'appartenance du média au tenant avant association.

Aucune ressource CMS ne doit créer sa propre table de stockage média pour remplacer `media_files`.

## Localization

L'interface admin supporte `fr`, `en`, `es` et `ar`. Les libellés des ressources et actions doivent rester dans les traductions du module ou dans le contrat i18n partagé. Les chaînes utilisateur codées en dur sont interdites aux nouvelles surfaces.

RTL est fourni par les primitives partagées et ne doit pas être implémenté module par module.

## Lifecycle and editorial safety

Publication, dépublication, archivage, restauration et suppression utilisent des Actions explicites. Une simple mutation de formulaire ne doit pas contourner la machine d'état du module.

Les actions éditoriales doivent produire les effets attendus : validation, autorisation, tenant check, transaction, révision/événement, audit et invalidation de cache lorsque nécessaire.

## Security

Les routes admin et organization admin vérifient l'authentification puis les permissions du domaine. Les Actions revalident toujours ces permissions côté serveur.

Les références croisées sont revalidées dans le tenant actif. Une route ou un composant ne constitue jamais la frontière de sécurité.

## Documentation des modules

- [Blog convergence](../blog-convergence.md)
- [Services](../services.md)
- [CMS platform architecture](../architecture/cms-platform.md)
- [Concordia synthesis](../architecture/concordia-synthesis.md)

## Future modules

Les prochains modules doivent réutiliser ce framework :

```text
Formations
Cours
Shop
Events
```

Ils pourront ajouter leurs propres concepts métier, mais ne doivent pas recréer les infrastructures de média, recherche, SEO, localization, workflow, révisions, notifications, audit ou administration.

Les capacités transactionnelles telles que paiement, panier, inventaire, réservation ou inscription restent des cores métier séparés.