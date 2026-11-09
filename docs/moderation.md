# Modération générique

Socle commun aux modules pour **signaler** un contenu et **décider** (masquer, rétablir, marquer comme
spam, clore, rejeter les signalements). La visibilité métier reste la seule source de vérité dans les
tables des modules (`blog_comments.status`, `service_reviews.status`…) : le socle ne stocke que les
signalements et l'historique des décisions.

## Tables (migration `0053_moderation_core`)

| Table | Rôle |
| --- | --- |
| `moderation_reports` | un signalement : `module`, `target_type`, `target_id`, `organization_id`, `reporter_id` (nullable), `reporter_key` (empreinte non nulle), `reason`, `description` nettoyée, `status` `open`/`resolved`/`dismissed` |
| `moderation_actions` | historique append-only : décision, motif codifié, note obligatoire, statut avant/après |

- Unicité partielle `(module, target_type, target_id, reporter_key) WHERE status = 'open'` :
  un signalement ouvert par signaleur et par cible, y compris pour les anonymes (la clé n'est jamais `NULL`).
- `reporter_key` = `h:` + HMAC-SHA256 (clé dérivée de `SIGNING_SECRET`) de l'utilisateur ou de l'IP ;
  ni IP ni identifiant en clair, ni en base ni dans les journaux.
- Des déclencheurs suppriment signalements et historique quand le contenu cible est supprimé
  (parité avec les anciennes clés étrangères en cascade).
- La migration reprend `blog_reports`, `service_reports` et `blog_comment_moderations`
  (statuts et motifs historiques conservés dans `legacy`), puis supprime ces tables.
- Le retour arrière recrée exactement les anciennes tables et leurs données ; les données génériques
  non exprimables (nouvelles décisions, cibles disparues) sont **conservées** dans
  `moderation_*_0053_archive`. Un second retour arrière est refusé tant que ces archives existent.

## Registre

```ts
// src/modules/<module>/moderation/adapters.ts (généré par `pnpm module:new`)
export const blogModeration = defineModuleModeration("blog", [
  { type: "comment", permission: { blogComment: ["moderate"] }, reporters: "anyone", load, excerpt, apply, afterCommit },
]);
```

- `load(executor, id)` → organisation, site, auteur, statut, visibilité publique (ou `null`).
- `canReport` (optionnel) : `(executor, id, reporterId)` → le signaleur peut-il signaler cette cible ?
  Remplace le critère « visible publiquement » pour les contenus à visibilité restreinte (forums
  membres / organisation, fils privés) ; refus = `NOT_FOUND` identique.
- `excerpt` → titre, texte court nettoyé et lien public, montrés aux seuls modérateurs autorisés.
- `apply` (optionnel) : mise à jour conditionnelle (`WHERE status = <courant>`) dans la transaction ;
  absent = cible « signalement seulement » (articles, services : statut éditorial inchangé).
- Adaptateurs livrés : `blog.post`, `blog.comment`, `blog.review`, `services.service`,
  `services.comment`, `services.review`, `forums.topic`, `forums.post` (le masquage d'un avis recalcule la note du service dans la
  même transaction).

## Actions (`actions.moderation.*`)

| Action | Règles |
| --- | --- |
| `report` | cible publique seulement ; services : connexion exigée ; débit 10 / 10 min par empreinte ; doublon accepté silencieusement |
| `decide` | `hide` / `spam` / `restore`, note obligatoire (3–1000) ; `hide`/`spam` closent les signalements ouverts |
| `resolve` | `resolved` / `dismissed` des signalements ouverts, sans toucher au contenu |

Une décision s'exécute dans **une** transaction : effet métier, ligne `moderation_actions`,
`audit_log` (`moderation.<module>.<décision>`, sans contenu, note, IP ni signaleur) et événement
`moderation.decided` dans `event_outbox` (charge utile : `actionId`, `module`, `targetType`,
`targetId`, `decision`). Une décision sans effet renvoie `changed: false` et n'écrit rien.

Autorisation par cible : permission de l'adaptateur sur l'organisation (et le site) du contenu ;
portée plateforme pour le contenu sans organisation. Une cible absente, invisible, étrangère ou
non autorisée renvoie la même erreur `NOT_FOUND` (aucune garantie de temps constant).

## Notifications

Catégorie `moderation` (canal in-app, préférences standard) : `CONTENT_HIDDEN` et
`CONTENT_RESTORED` pour l'auteur du contenu, créées depuis l'outbox (dédupliquées par événement).
L'ancien circuit d'approbation des commentaires/avis garde ses propres notifications : pas de doublon.

## Interface

- `/{lang}/admin/moderation` (plateforme) et `/{lang}/organizations/{slug}/moderation`
  (organisation) : file groupée par cible (nombre, motifs, dates, dernière décision), onglets par
  statut, formulaire motivé par élément ; pages localisées fr/en/es/ar, dans pa11y et Lighthouse.
- Les anciennes vues blog et services affichent le nombre de signalements et renvoient vers la file ;
  les façades `createBlogReport`, `updateBlogReport`, `createServiceReport`, `resolveServiceReport`
  délèguent au socle.

## Hors périmètre

IA, sanctions, appels, messages privés, modération automatique, autres adaptateurs, purge des signalements.
