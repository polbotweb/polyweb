# Forums

Forums **par site** : forums → catégories (seedées, éditables, ordonnées) → sujets → réponses.
Étiquettes, visibilité par forum, recherche plein texte, Markdown nettoyé (sans pièces jointes),
votes et réactions dédupliqués, réputation et badges, sondages, fils privés, modération motivée
(verrouiller / épingler / déplacer), sanctions automatiques réversibles, notifications via
`event_outbox`, limites de débit, 4 locales.

## Tables (migration `0055_forums_core`)

| Table | Rôle |
| --- | --- |
| `forums` (+ `forum_revisions`, `forum_locks`) | un forum par site (`slug` unique par site), `visibility` `public` / `members` / `org`, statut éditorial `DRAFT` / `PUBLISHED` / `ARCHIVED` |
| `forum_categories` | slug unique par forum, `position`, noms et descriptions par locale (`translations`) |
| `forum_tags`, `forum_topic_tags` | étiquettes du site (≤ 5 par sujet) |
| `forum_topics`, `forum_posts` | Markdown source + HTML nettoyé, `status` `visible` / `hidden` / `spam`, compteurs, `search_vector` généré + index GIN |
| `forum_votes`, `forum_reactions` | un vote (±1) et une réaction de chaque type par utilisateur et par cible |
| `forum_user_stats` | réputation et compteurs par site (badges) |
| `forum_polls`, `forum_poll_options`, `forum_poll_ballots`, `forum_poll_votes` | sondages (choix simple / multiple, résultats `always` / `after_vote` / `after_close`), un bulletin par utilisateur |
| `forum_topic_participants`, `forum_topic_follows` | fils privés et abonnements |
| `forum_sanction_policies`, `forum_sanctions` | politique par site et sanctions (`mute` / `suspension`, fin, révocation) |
| `badge_awards` (core) | badges attribués, toutes sources confondues |

Le retour arrière supprime les tables du module et les déclencheurs de nettoyage des signalements ;
le journal et l'instantané Drizzle sont cohérents (`pnpm drizzle-kit generate` ne produit rien).

## Accès

- `forumsCan(viewer, { organizationId, siteId }, actions)` : permissions `forums`
  (`read`, `create`, `update`, `publish`, `delete`, `moderate`, `configure`) dans la portée organisation + site.
- Forum brouillon / archivé : gestionnaires seulement. `members` : connectés. `org` : membres de l'organisation.
- Fil privé : **participants seulement**, y compris pour les modérateurs (qui ne voient que l'extrait
  signalé dans la file). L'invitation réutilise les préférences et blocages de la messagerie.
- Tout refus (forum invisible, autre site, sujet privé, masqué, inexistant) renvoie le même
  `NOT_FOUND` (404 sur les pages).

## Contenu

Markdown sans dépendance (`src/core/content/markdown.ts`) : titres décalés (`#` → `h3`), listes,
emphase, code, citations, liens `http(s)` / `mailto` / relatifs (`rel="nofollow ugc noopener noreferrer"`),
mentions `@pseudo`. Tout le texte source est échappé, puis le HTML repasse par `sanitizeHtml`
(liste blanche) ; ni HTML brut, ni images, ni pièces jointes.

## Communauté

- Votes : pas de vote sur son propre contenu ; changer de sens remplace le vote.
- Réputation : +10 vote positif reçu, −2 vote négatif, +15 réponse acceptée (plancher 0).
- Badges (`src/modules/forums/domain/badges.ts`, registre typé `src/core/badges`) :
  `first_topic`, `first_reply`, `helpful`, `appreciated`, `contributor`, `solver`, `respected` ;
  attribution idempotente (`ON CONFLICT DO NOTHING`), notifiée une seule fois.
- Réactions : `like`, `thanks`, `insightful`, `funny`, `agree`.

## Modération

- Adaptateurs `forums.topic` et `forums.post` (`src/modules/forums/moderation/adapters.ts`) : signalement
  réservé aux connectés **qui voient** le contenu (crochet `canReport`), masquage / spam / rétablissement.
- Outils de sujet (permission `moderate`) : verrouiller, déverrouiller, épingler, désépingler, déplacer
  vers une autre catégorie — **motif obligatoire**, `audit_log` `forums.topic.<outil>`.
- Toute action d'administration est auditée (`forums.forum.*`, `forums.category.*`, `forums.tag.*`,
  `forums.sanction_policy.update`, `forums.sanction.apply` / `revoke`).

## Sanctions automatiques

Politique par site (défaut : fenêtre 30 jours, sourdine dès 3 contenus masqués pour 24 h, suspension
dès 5 pour 7 jours). Après une décision retenue : seuil de suspension atteint ou récidive après une
sourdine → suspension ; sinon sourdine. Jamais de doublon si une sanction équivalente est active.
Sourdine : publication bloquée ; suspension : toute interaction bloquée. Chaque sanction est auditée,
notifiée (`SANCTION_APPLIED` / `SANCTION_LIFTED`) et révocable avec motif depuis
`/{lang}/admin/forums/sanctions`. Les messages d'erreur ne révèlent ni le nombre de signalements
ni les signaleurs.

## Notifications (outbox)

| Événement | Type | Destinataires |
| --- | --- | --- |
| `forums.post_created` | `TOPIC_REPLY` | abonnés du sujet (sauf l'auteur, participants seulement pour un fil privé) |
| `forums.mentioned` | `MENTION` | membres mentionnés qui voient le sujet |
| `forums.badge_awarded` | `BADGE_AWARDED` | le membre |
| `forums.sanction_applied` / `forums.sanction_revoked` | `SANCTION_APPLIED` / `SANCTION_LIFTED` | le membre |

Les charges utiles ne contiennent jamais le corps des messages.

## Limites de débit (par utilisateur)

Sujets 5 / 10 min, réponses 20 / 10 min, votes et réactions 60 / min, sondages 20 / min,
invitations 20 / h, abonnements 30 / min ; administration 60 / min.

## Interface

- Public : `/{lang}/forums`, `/{lang}/forums/{forum}` (filtres catégorie / étiquette, recherche,
  pagination, nouveau sujet), `/{lang}/forums/{forum}/t/{id}` (réponses, votes, réactions, sondage,
  participants, outils de modération). Formulaires sans JavaScript (POST + redirection 303).
- Administration : `/{lang}/admin/forums` (forums, catégories en 4 langues, ordre, suppression avec
  déplacement des sujets, étiquettes) et `/{lang}/admin/forums/sanctions`.
- Pages dans pa11y et Lighthouse (public, connecté, administrateur) ; parcours E2E `tests/e2e/forums.spec.ts`.
