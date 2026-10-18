# Rapport du module Blog — état consolidé

> **Date de revue** : 2026-08-01
> **Stack** : Astro SSR, Drizzle/PostgreSQL, Better Auth, Astro Actions.
> **Statut** : fondations fonctionnelles présentes; tranche P0 de sécurité et
> d'intégrité implémentée, sous réserve des validations listées ci-dessous.

## Périmètre observé

Le dépôt contient les parcours globaux et organisationnels pour les articles,
traductions, taxonomies, commentaires, avis, réactions, favoris, signalements,
galeries, liens internes, newsletter, vues, SEO et administration. Cette
présence fonctionnelle ne vaut pas certification de préparation production.

## État consolidé après la tranche P0

| Domaine | État vérifiable dans le code |
| --- | --- |
| Autorisation | Permissions globales pour le site global; `hasPermission` Better Auth avec organisation explicite pour les sites d'organisation; capacités publier/supprimer calculées côté serveur. |
| Isolation tenant | Contrôles parent/tenant sur articles, taxonomies, médias, galeries, traductions, liens, files de modération et notifications. |
| Visibilité | Prédicat public commun incluant la date de publication, utilisé par les loaders, la recherche et les engagements publics. |
| Atomicité | Transactions sur les écritures d'agrégat et les opérations multi-écritures P0. |
| Données | Migration officielle `0005` avec préflight des doublons, backfill des scopes, index entité+locale et contrôles d'intégrité. |
| Newsletter | Service métier partagé, origine configurée, tokens hashés et séparés par finalité, expiration et consommation atomique, compatibilité legacy explicite. |
| Éditeur | Sortie HTML temporaire cohérente, attributs sanitizés, construction DOM sans interpolation HTML de données utilisateur, garde de formulaire modifié. |

## Limites connues

1. La migration doit être répétée sur une copie de données représentative. Elle
   échoue volontairement, sans suppression silencieuse, si des doublons ou
   incohérences historiques existent.
2. La délivrabilité newsletter nécessite un test avec la configuration SMTP de
   staging. Un test unitaire ne valide ni le fournisseur ni la réputation
   d'envoi.
3. Les E2E et contrôles d'accessibilité/performance nécessitent l'environnement
   complet (PostgreSQL, serveur, navigateur).
4. Cette tranche ne clôt pas les travaux P1/P2 : observabilité, SLI/SLO,
   procédures d'incident, release/promotion/rollback, supply-chain et FinOps.

## Validation attendue avant promotion

- Tests ciblés Blog, newsletter et éditeur.
- `pnpm check`, `pnpm lint`, `pnpm build`.
- Application/rollback contrôlés de `0005` sur un clone de staging.
- Parcours global et organisationnel : création brouillon, publication,
  modération, notification, engagement public et newsletter.
- Pa11y/Lighthouse et E2E sur les routes Blog retenues.

## Conclusion

Le changement réduit les risques P0 identifiés, mais le module ne doit pas être
présenté comme « entièrement prêt production » tant que les validations
d'environnement, la migration de données et les chantiers opérationnels
restants ne sont pas terminés.
