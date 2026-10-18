# Implementation routing CMS

Date : 2026-09-06

## Livré

- Services globaux : `/fr/services`, `/fr/services/category/[category]`, `/fr/services/category/[category]/[slug]`, `/fr/services/[slug]`, `/fr/services/tag/[tag]`.
- Services organisationnels : `/fr/[organization]/services`, `/fr/[organization]/services/category/[category]`, `/fr/[organization]/services/category/[category]/[slug]`, `/fr/[organization]/services/[slug]`, `/fr/[organization]/services/tag/[tag]`.
- Blog globaux : `/fr/blog`, `/fr/blog/[category]`, `/fr/blog/[category]/[slug]`, `/fr/blog/tag/[tag]`, `/fr/blog/author/[username]`.
- Blog organisationnels : `/fr/[organization]/blog`, `/fr/[organization]/blog/[category]`, `/fr/[organization]/blog/[category]/[slug]`, `/fr/[organization]/blog/tag/[tag]`, `/fr/[organization]/blog/author/[username]`.
- Admin organisationnel direct : `/fr/[organization]/admin/blog/...` et `/fr/[organization]/admin/services/...`.
- Builders centralisés dans `src/lib/routing/content-routes.ts`.
- Builders Services mis à jour pour le segment `category` et le service direct sans segment `service`.
- Générateurs Blog, sitemaps, cartes et détail Services alignés sur le namespace direct.
- Tests de contrat centralisés dans `tests/unit/routing/content-routes.test.ts`.

## Choix d'implémentation

Les nouvelles routes Blog utilisent temporairement `Astro.rewrite` vers le resolver Blog existant afin de conserver une seule implémentation du chargement, de la modération, du SEO, des commentaires et des traductions pendant la migration. L'URL publique reste la nouvelle URL directe ; l'ancien chemin est interne au serveur et n'est pas généré comme canonical.

Les anciennes routes publiques Services concurrentes ont été supprimées. Aucun système de redirection legacy n'a été ajouté, conformément à la décision que le site n'est pas encore en production.

## Vérifications

- `pnpm check` : passe sans erreur.
- `pnpm build` : passe sans collision de routes.
- Suite ciblée routing/blog/services : passe.
- Suite Vitest complète : **116 fichiers, 1 321 tests passés**.

Les avertissements restants concernent la configuration Vite, les imports dynamiques, `SITE_URL` absent et le dossier d'icônes manquant ; ils ne sont pas causés par la migration de routes.
