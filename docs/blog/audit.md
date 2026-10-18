# Audit du module Blog — suivi de remédiation

> **Périmètre** : schéma, loaders, actions, composants et routes Blog.
> **Statut au 1er août 2026** : tranche P0 de durcissement en cours de validation.
> Ce document décrit l'état observé dans le dépôt. Il ne certifie pas que la
> roadmap P1/P2, le déploiement ou l'exploitation en production sont terminés.

## Méthode et niveau de preuve

Les constats sont vérifiés dans les fichiers du dépôt et par les tests ciblés.
Les anciens totaux de tests et mentions « audit clôturé » ont été retirés :
ils correspondaient à une exécution antérieure et ne prouvaient pas l'état
courant. Les résultats de validation de cette tranche doivent être lus dans le
rapport d'exécution associé au changement.

## Tranche P0 mise en œuvre

### Autorisation et isolation

- Le blog global utilise les permissions globales Better Auth.
- Un blog d'organisation utilise
  `auth.api.hasPermission({ headers, body: { organizationId, permissions } })`.
- L'identifiant d'organisation envoyé par le client n'accorde aucun privilège
  implicite et il n'existe plus de bypass générique pour le rôle `admin`.
- Créer un brouillon requiert `blog:create`; publier lors d'une création ou
  d'une transition requiert en plus `blog:publish`.
- Les pages d'administration calculent réellement `canPublish` et `canDelete`.
- Les catégories, tags, médias, galeries, traductions et liens explicites sont
  contrôlés dans le tenant attendu avant leur écriture.

### Atomicité et visibilité publique

- Les agrégats article, les modérations avec notifications, les compteurs de
  vues et les autres écritures multi-étapes concernées sont transactionnels.
- Le prédicat public partagé est :
  `status = PUBLISHED AND published_at <= now()`.
- Ce prédicat protège les loaders publics, la recherche et les engagements
  (commentaires, avis, réactions, favoris, votes utiles, signalements, vues).
- La recherche initiale de `getBlogPostBySlug` inclut le tenant avant
  `LIMIT 1`.
- Les parents de commentaire doivent appartenir au même article public; la
  profondeur acceptée correspond au niveau rendu par l'interface.

### Schéma et migrations

- `0005_hard_joseph.sql` est la migration corrective générée après `0004`.
- Elle vérifie les doublons sans supprimer arbitrairement de données, puis
  recopie les scopes de traduction depuis les parents avant de créer les index.
- Elle rétablit l'unicité entité + locale pour articles, catégories et tags.
- Des contrôles bornent les notes et les heures, et interdisent les liens vers
  soi-même.
- Des triggers garantissent que le scope d'une traduction reste identique à
  celui de son parent.

### Notifications et newsletter

- Les notifications portent le contexte article et, si nécessaire, un sujet
  commentaire ou avis; elles sont persistées et filtrées par organisation.
- `REVIEW_REJECTED` est pris en charge dans le schéma applicatif et les quatre
  locales.
- La newsletter utilise un service métier partagé par les Actions et les routes
  HTTP, une origine serveur configurée, et des hashes séparés par finalité.
- L'expiration de confirmation et les états de consommation sont persistés.
- La compatibilité des anciens tokens en clair est isolée dans une branche
  explicitement documentée; les nouveaux abonnements n'utilisent plus ce champ.
- Un échec SMTP est audité sans adresse email en clair puis remonté comme erreur
  opérationnelle générique.

### Éditeur

- Les commandes titre/liste produisent du HTML.
- Le sanitizer limite `id` aux titres contrôlés et `data-internal-link` aux
  ancres avec une valeur contrôlée.
- Les résultats de recherche et de vérification de liens sont construits avec
  des nœuds DOM et `textContent`.
- Un formulaire modifié déclenche la protection `beforeunload`.

## Points restant à suivre

- Exécuter la migration sur une copie représentative avant promotion; un échec
  de préflight impose une décision humaine de fusion/quarantaine.
- Vérifier le parcours SMTP réel avec le fournisseur de staging.
- Exécuter E2E, Pa11y et Lighthouse dans l'environnement avec navigateur,
  serveur et PostgreSQL disponibles.
- Les sujets P1/P2 (observabilité complète, SLO, release engineering,
  supply-chain, déploiement et FinOps) restent hors de cette tranche.

## Checklist de validation

- [ ] Tests unitaires ciblés Blog/newsletter/éditeur
- [ ] `pnpm check`
- [ ] `pnpm lint`
- [ ] `pnpm build`
- [ ] Migration `0005` testée sur une base représentative
- [ ] E2E / Pa11y / Lighthouse en staging
