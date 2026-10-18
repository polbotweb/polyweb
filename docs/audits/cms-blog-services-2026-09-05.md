# Audit Atomic CMS, Blog et Services

Date : 2026-09-05. Audit du code local et validations locales, sans correction applicative.

## Conclusion immediate

**Ne pas deployer cette revision ni la prendre comme reference stable pour un troisieme module.** Le build echoue, les actions Blog presentent un blocage Zod et des defauts de securite, d'integrite et de routage subsistent.

Atomic possede une base interessante pour un CMS metier multi-tenant sous Astro : PostgreSQL, relations explicites, traductions relationnelles, RBAC, editeur partage, medias communs et separation des domaines. L'architecture annoncee est plus mature que ses garanties effectivement executees.

Il s'agit du CMS applicatif Atomic construit sur Astro, pas d'un CMS complet fourni nativement par Astro. Le framework SSR n'est pas la principale limite observee.

## Perimetre et niveau de preuve

Examen des chemins critiques Pages/Sections/Versions, actions Blog et Services, loaders publics/admin, schemas, registre de modules, recherche, rendu HTML/SEO, medias, newsletter, cache, cron, CI et exploitation. Les anciens audits n'ont pas ete consideres comme des preuves actuelles.

- **Execute** : Astro check, ESLint, build de production, deux selections de tests unitaires, trois sondes locales sans base de donnees.
- **Statique** : defauts deduits des chemins de donnees et des requetes effectivement presentes.
- **Risque** : comportement concurrent ou de production a confirmer par tests d'integration/charge.
- **Non valide** : migrations sur une base vierge et une base historique, E2E navigateurs, accessibilite manuelle, charge, restauration de sauvegarde, configuration et comportement de la production.

Le build bloque la validation navigateur de cette revision. Aucune migration ni mutation d'une base de donnees n'a ete lancee. Cet audit transversal n'est pas une certification exhaustive de toutes les branches du programme, ni un pentest complet. Le rapport nomme les limites plutot que de pretendre une couverture integrale non obtenue.

## Verifications executees

| Controle | Resultat local |
| --- | --- |
| `corepack pnpm run check` | Echec : 111 erreurs, 0 warning, 47 hints, 900 fichiers analyses |
| `corepack pnpm run lint` | Echec : 17 erreurs, 21 warnings |
| `corepack pnpm exec astro build` | Echec de syntaxe dans la taxonomie Services ; collisions de routes signalees |
| Selection tests Pages/Blog/lifecycle/Services | 78 passes, 3 echecs signales, dont un echec de chargement de suite |
| Selection tests contrats/recherche/cache/validation/engagement | 114 passes, 33 echecs signales, dont des echecs de chargement |
| Sonde JSON-LD | Titre accepte ; `</script>` preserve par `JSON.stringify` |
| Sonde contexte Services | Contexte omis : `organization_id = $1`, parametre undefined serialise en null |
| Sonde cache | Apres invalidation pendant chargement : ancienne valeur recachee, un seul appel loader |

Les compteurs de l'outil de tests incluent des echecs de chargement : ce ne sont pas 36 bugs applicatifs distincts. Exemples de dette de tests : anciens imports de recherche, mocks sans transaction/execute, attentes de contrats anterieures a l'ajout d'attributes. La couverture globale n'a pas ete mesuree pendant cet audit.

Le build local signale aussi l'absence de SITE_URL dans son environnement. Ce constat local ne prouve pas une mauvaise configuration en production. Les commandes pnpm ont affiche des avertissements de configuration/installation ; le rapport de tests suivi dans Git a ete regenere.

## Constats prioritaires

Priorites : P0 = bloque la livraison ; P1 = securite, integrite ou parcours essentiel ; P2 = fonctionnalite, maintenabilite ou preparation a l'echelle.

### F01 - P0 - Build Services impossible

**Preuve executee.** [Taxonomie Services](../../src/actions/services/taxonomy.ts#L50) : la declaration de deleteServiceTag termine le handler sans fermer correctement l'objet transmis a defineAction. Esbuild echoue avec `Expected "}" but found ")"`.

Impact : aucun nouvel artefact de production fiable. Corriger puis reconstruire ; ne pas assimiler un lint partiellement vert a un build valide.

### F02 - P0 - Import des actions Blog impossible avec le Zod installe

**Preuve executee par test.** [Actions Blog](../../src/actions/blog/post.ts#L146) et [validation Blog](../../src/lib/blog/validation.ts) : extension avec remplacement de cles sur un schema contenant des refinements. Zod leve `Cannot overwrite keys on object schemas containing refinements. Use .safeExtend() instead.`

Impact : echec a l'import du module d'actions, pas seulement refus d'une saisie. Recomposer le schema ou utiliser safeExtend en preservant les invariants ; tester l'import du registre d'actions entier. Le build actuel s'arrete d'abord sur F01.

### F03 - P1 - Injection HTML stockee via JSON-LD Services

**Flux statique et sonde de serialisation executes.** [Route de detail](../../src/pages/[lang]/services/[categorySlug]/[slug].astro#L24), [validation](../../src/modules/services/validation/index.ts#L23) et [generateur SEO](../../src/modules/services/seo/index.ts).

Un titre editorial contenant `</script><p id=audit-proof>preuve</p>` respecte le schema. Les quatre routes de detail Services injectent le resultat de JSON.stringify dans une balise script avec set:html. JSON.stringify n'echappe pas le terminateur HTML.

Impact : sortie du contexte JSON-LD et injection de balisage par un contributeur autorise ; risque XSS selon la CSP et les ressources autorisees. Une execution JavaScript en navigateur n'a pas ete tentee. La protection existe deja : [safeJsonLd](../../src/lib/sanitize.ts#L49). L'utiliser partout et ajouter un test de rendu avec terminateur script.

### F04 - P1 - Routes Services concurrentes et canonicalisation incomplete

**Collisions confirmees par Astro build.** [Route categorie globale](../../src/pages/[lang]/services/[categorySlug].astro), [route service globale](../../src/pages/[lang]/services/[slug].astro), et leurs equivalents organisation : deux fichiers dynamiques ont le meme motif URL. Renommer le parametre ne cree pas une route distincte.

Le fallback de categorie redirige vers buildServiceUrl. Pour un service sans categorie, cette URL peut etre identique a l'URL courante. La branche choisie depend du routage en collision ; le risque de boucle est conditionnel, pas reproduit en navigateur.

Unifier la resolution ou differencier explicitement les prefixes. Tester categorie, service sans categorie, homonymes, contexte organisation et 404.

### F05 - P1 - Listes globales Services filtrees par egalite a NULL

**Sonde SQL executee.** [Loader Services](../../src/modules/services/loaders/index.ts#L62) et [route categorie](../../src/pages/[lang]/services/[categorySlug].astro#L22).

Le schema accepte organizationId omis ; getServices ne normalise pas cette valeur. serviceTenantScope traite seulement null comme global et produit une egalite avec undefined. La route categorie appelle getServices sans organizationId. PostgreSQL ne satisfait pas `organization_id = NULL` : les listes globales concernees peuvent etre vides.

Normaliser a la frontiere, avec tests omission/null/organisation autorisee et rejet inter-tenant.

### F06 - P1 - Import CMS non atomique et validation divergente

**Preuve statique.** [Import de contenu](../../src/pages/api/content-import.ts#L84).

La page est modifiee, puis ses sections supprimees et reinserrees sans transaction. Une erreur d'insertion peut laisser les anciennes sections perdues et la page modifiee, tout en comptant l'element comme skipped. sections=[] ne vide pas les sections existantes, contrairement a une restauration fidele.

Le schema d'import accepte contenu inconnu, types et locales arbitraires, contrairement aux actions normales. Le rendu public resanitise le HTML : pas de XSS prouvee sur cette seule base. Mais des contenus incompatibles ou trop volumineux peuvent etre stockes puis echouer au rendu.

Transaction par agregat page, validation canonique partagee, prevalidation, snapshot avant remplacement et semantique explicite des sections vides. Tester une panne entre suppression et insertion.

### F07 - P1 - Verrous non atomiques et application inegale

**Analyse statique de concurrence.** [Verrou Blog](../../src/actions/blog/post.ts#L317), [lifecycle Services](../../src/actions/services/lifecycle.ts), [sections CMS](../../src/actions/admin/sections.ts).

Lecture du verrou puis upsert non conditionnel : deux utilisateurs peuvent lire l'absence/expiration et obtenir success. Les mutations ne font pas toutes une verification atomique avec leur ecriture. Blog verifie parfois seulement userId, parfois userId et sessionId ; ses transitions de lifecycle n'appliquent pas le verrou. Les actions Sections n'appliquent pas le verrou de Page.

Adopter acquisition conditionnelle en base, jeton/version de verrou et controle dans la transaction. Ajouter un test a deux connexions concurrentes ; une seule doit gagner. L'optimistic locking optionnel des pages/sections ne protege pas les appels qui omettent expectedUpdatedAt.

### F08 - P1 - Cache pouvant ressusciter une valeur invalidee

**Reproduction locale executee.** [Cache](../../src/database/cache.ts#L88).

invalidateCache supprime les entrees, pas la validite des chargements en cours. Une requete ayant lu l'ancien etat peut terminer apres invalidation et remettre ce resultat en cache. Le TTL glissant peut ensuite le maintenir jusqu'au maximum absolu de 30 minutes.

Impact : publication, depublication et modifications potentiellement invisibles ou perimees. Ajouter une generation d'invalidation ou des versions de cles et tester explicitement lecture/ecriture concurrentes.

### F09 - P1 avant multi-instance - Etat local non partage

**Preuve statique.** [Stores](../../src/lib/store.ts#L90), [upload](../../src/media/upload.ts#L85), [cache](../../src/database/cache.ts).

Les seuls stores livres sont en memoire ; STORE_BACKEND=redis est un commentaire de futur travail. Le contrat synchrone get/set ne fournit pas d'operation atomique distribuee de rate limiting. Les uploads sont locaux ; Compose fournit un volume local, pas une strategie multi-noeud.

Impact : invalidation et quotas differents selon le replica, media absent sur un autre noeud. Implementer stockage objet partage ou filesystem reellement partage, cache distribue/invalidation, compteurs atomiques et tests sur deux instances. Verifier aussi tout usage des sessions filesystem activees par l'adaptateur ; ne pas les confondre avec les sessions Better Auth.

### F10 - P1 - Publication Services commitee avant notification faillible

**Preuve statique.** [Transitions et restauration](../../src/actions/services/lifecycle.ts#L28).

L'etat est commite avant createServiceNotification, puis l'audit et l'invalidation arrivent apres. Si la notification echoue, l'action echoue alors que le service est deja publie. Une nouvelle tentative peut etre refusee comme transition invalide. Le meme motif existe sur certaines contributions.

Utiliser une outbox transactionnelle et une livraison idempotente, ou au minimum definir explicitement les effets secondaires non bloquants. Tester notification indisponible apres commit.

### F11 - P1/P2 - Revisions incompletes et lifecycle non homogene

**Preuve statique.** [Versions CMS](../../src/actions/admin/versions.ts#L204), [publication CMS](../../src/actions/admin/pages.ts#L226), [revisions Services](../../src/database/schemas/services.schema.ts), [lifecycle Blog](../../src/actions/blog/lifecycle.ts#L17).

- Pages : publication puis snapshot hors transaction ; echec du snapshot avale. Allocation max(version)+1 concurrente. Restauration de tous les champs historiques, dont publication/verrou, avec seulement page:update.
- Les roles statiques editor/admin ont aujourd'hui publish ; le probleme de restauration est un contrat de permission non respecte, pas une elevation demontree pour un role statique existant. Il devient critique avec un role update sans publish.
- Blog : transitions snapshotent la locale par defaut ; un article cree uniquement en espagnol peut changer d'etat sans revision de cette transition. Restaurer une revision non canonique ecrit aussi son slug dans le slug de base.
- Services : changements de statut sans appendRevision ; revisions limitees au texte, sans prix, disponibilites, medias, taxonomie ni attributs.

Definir si une revision restaure une traduction ou l'agregat metier entier, conserver un schema de snapshot versionne, et rendre les garanties equivalentes entre modules. Une revision historique ne doit pas reintroduire un ancien verrou.

### F12 - P1/P2 - Engagement public Services confondu avec appartenance organisation

**Preuve statique ; intention produit a confirmer.** [Engagement Services](../../src/actions/services/engagement.ts#L24), [permissions](../../src/modules/services/permissions/index.ts#L19).

Pour commenter, noter ou mettre en favori un service d'organisation, le visiteur doit passer auth.api.hasPermission sur cette organisation. Un client connecte non membre peut donc consulter l'offre publique mais ne pas contribuer. Si une marketplace publique est visee, c'est un blocage fonctionnel ; si le produit est un intranet, c'est une politique acceptable.

Separer autorisation d'administration et eligibilite a l'engagement public, avec tests visiteur/client/membre/moderateur.

### F13 - P2 - Notifications de reponse Services supprimees

**Preuve statique.** [Creation de commentaire](../../src/actions/services/engagement.ts#L40) et [notification](../../src/actions/services/notification.ts#L24).

L'action cible l'auteur du commentaire parent, mais transmet l'ID de la nouvelle reponse. Le helper compare le destinataire a l'auteur de cette nouvelle reponse. Pour deux auteurs differents, il retourne null : la notification attendue n'est pas inseree.

Resoudre explicitement le parent ; test avec deux utilisateurs distincts.

### F14 - P2 - Donnees Services presentes mais parcours public incomplet

**Preuve statique.** [Detail public](../../src/modules/services/components/single/ServiceDetail.astro) et [loader](../../src/modules/services/loaders/index.ts#L26).

Les medias de galerie sont charges mais non rendus ; leur projection ne contient meme pas l'URL du fichier. Les attributs ont des actions et tables mais ne sont pas projetes dans le detail public examine. required est stocke dans les definitions sans controle de completude dans publishService.

Terminer le parcours definition/saisie/validation/publication/rendu, pas seulement le stockage. Test E2E : ajouter une image et un attribut requis, publier, verifier le resultat public.

### F15 - P2 - SEO Services decouple de ses champs editables

**Preuve statique.** [Route detail](../../src/pages/[lang]/services/[categorySlug]/[slug].astro#L22), [layout](../../src/layouts/BaseLayout.astro#L95), [formulaire](../../src/components/services/AdminServiceForm.astro).

Les routes utilisent le titre et souvent l'extrait plutot que les champs SEO dedies ; canonicalUrl, ogImageId et metaRobots ne sont pas correctement consommes sur ce chemin. Une seconde canonical est ajoutee dans le slot de contenu alors que BaseLayout en cree deja une dans head. Les URLs alternatives localisees ne sont pas transmises.

Un contrat SEO partage doit alimenter head, canonical, robots, OG/Twitter, hreflang et JSON-LD. Tester le HTML final et une traduction au slug different. Plusieurs categories peuvent aujourd'hui donner plusieurs URLs auto-canoniques pour le meme service.

### F16 - P2 - Decouverte non dimensionnee aux gros volumes

**Preuve statique.** [Sitemap CMS](../../src/pages/sitemap-cms.xml.ts#L17), [sitemap organisations](../../src/pages/sitemap-services-org.xml.ts), [liste Pages](../../src/database/loaders/page.loader.ts#L97).

Les sitemaps reconstruisent des tableaux complets avec les loaders de presentation, y compris relations et contenu inutile. Pas de decoupage explicite a 50 000 URLs ; erreurs capturees puis XML partiel renvoye en succes. La liste Pages est plafonnee a 500 par locale, sans pagination pour le sitemap. robots/noindex n'est pas filtre ici.

Creer des projections SEO legeres, pagination par curseur, sitemap index et fragments caches. Tester 501 pages, gros catalogue, erreurs SQL et contenus noindex.

### F17 - P2 - Recherche et registre encore fermes aux extensions reelles

**Preuve statique.** [Recherche API](../../src/pages/api/search.ts#L51), [registre](../../src/core/modules/module-registry.ts#L5), [contrat](../../src/core/modules/module-contract.ts#L64), [catalogue](../../src/lib/cms/capabilities.ts).

La recherche execute un UNION fixe Pages/Blog/Services ; le registre Search ne pilote pas ces requetes. Le registre Modules controle seulement l'unicite d'ID ; il n'appelle pas assertModuleCapabilityProviders. Les providers sont des chaines et le catalogue cite souvent les implementations specifiques Blog/Services.

Ce n'est pas un systeme de plugins executable complet. Garder l'enregistrement explicite, mais lui faire valider les contrats et utiliser de vrais adaptateurs pour les fonctions qui doivent s'etendre sans modifier le noyau.

### F18 - P2 - Planification dependante d'un cron non prouve

**Preuve statique.** [Loader Pages](../../src/database/loaders/page.loader.ts#L27), [cron](../../src/pages/api/cron/publish.ts#L56).

Le loader public gere scheduledAt mais pas scheduledUnpublishAt. La depublication depend du cron externe. Chaque erreur du cron est capturee et la reponse finale reste `ok:true`, HTTP 200 ; publication programmee sans historique equivalent a l'action manuelle.

Tester retard/panne du cron ; retourner un statut exploitable, suivre la derniere execution et definir la semantique temporelle au niveau public et du cache.

### F19 - P2 - Contraintes et validation metier Services a durcir

**Analyse statique.** [Disponibilites](../../src/actions/services/availability.ts#L10), [schemas](../../src/database/schemas/services.schema.ts), [validation](../../src/modules/services/validation/index.ts#L115).

Le chevauchement est verifie avant insertion sans exclusion SQL : deux appels concurrents peuvent passer. Le fuseau horaire est une chaine, pas un identifiant IANA valide. Prix et devise ne forment pas un invariant couple. Certaines unicites de base sur (organizationId, slug) ne couvrent pas les NULL globaux ; les traductions ont en revanche des index partiels globaux corrects.

Les FK simples garantissent l'existence, pas l'egalite des tenants entre entite et reference ; les actions principales font ces controles mais aucune garantie SQL equivalente n'a ete etablie dans les fichiers examines. Ce n'est pas une fuite inter-tenant demontree.

Ajouter les contraintes justifiees par le domaine et tests PostgreSQL concurrents ; ne pas assimiler disponibilites editoriales et moteur de reservation.

### F20 - P2 - Reinscription newsletter destructive pour un abonne confirme

**Preuve statique.** [Newsletter](../../src/lib/newsletter/blog-newsletter-service.ts#L149).

Toute nouvelle soumission d'une adresse existante remplace les tokens et remet le statut a PENDING avant confirmation. Une personne connaissant l'adresse d'un abonne peut donc provoquer sa sortie de l'etat CONFIRMED ; les anciens liens de desinscription v2 sont aussi invalides apres rotation.

Le double opt-in et les tokens hashes sont de vrais points forts, mais une nouvelle demande non verifiee ne devrait pas retirer le consentement confirme existant. Tester reabonnement confirme, echec SMTP et concurrence.

### F21 - P2 - Performance non mesuree et lectures trop riches

**Preuve statique, pas benchmark.** [Liste Services](../../src/modules/services/loaders/index.ts#L77) et [liste Blog](../../src/database/loaders/blog.loader.ts#L64).

Les relations de liste sont groupees : l'ancien N+1 Blog n'est plus present sur ce chemin. Mais les listes lisent les traductions completes, y compris content, les sitemaps reutilisent ces projections, et les offsets profonds ne sont pas optimises par curseur. Les invalidations Blog balayent tous les tenants des prefixes concernes. Les loaders Services examines n'utilisent pas le cache alors que les mutations invalident des prefixes services.

Mesurer avant d'annoncer un nombre d'utilisateurs ou de contenus supportes. Projections de carte, index composites selon EXPLAIN, budgets de requetes et cache par tenant/ressource sont les premiers leviers.

### F22 - P2 - Exploitation et accessibilite non certifiees

**Preuve de configuration.** [CI](../../.github/workflows/ci.yml#L316), [health](../../src/pages/api/health.ts), [Compose](../../docker-compose.yml), [Pa11y](../../.pa11yci.cjs), [Lighthouse](../../lighthouserc.cjs).

La CI contient de vrais controles, mais la livraison vers un hebergeur est un placeholder. Un healthcheck et des timeouts DB existent ; cela ne demontre pas une restauration de sauvegarde, un rollback ni un SLA. Sans HEALTH_TOKEN, le healthcheck assimile l'absence de x-forwarded-for a une requete locale : ce n'est pas une verification de loopback.

Blog listing/admin est inclus dans les configurations a11y/performance ; Services n'y est pas. Ni cette configuration, ni un label WCAG AAA, ne prouvent la conformite. Verification clavier, focus, erreurs de formulaires, zoom, lecteur d'ecran et RTL mobile reste a executer apres remise en etat.

## Maturite par domaine

| Domaine | Ce qui existe reellement | Limite principale |
| --- | --- | --- |
| Pages CMS | Sections typees, permissions, programmation, versions, import/export | Chemins d'ecriture heterogenes ; import et historique non atomiques |
| Blog | Taxonomies, traductions, revisions, medias, moderation, reactions, notifications, newsletter | Import des actions casse ; dette de tests ; concurrence a consolider |
| Services | Prix en unite mineure, duree, capacite, disponibilites, contenu localise, engagement | Build/routage/listes globales ; parite fonctionnelle publique incomplete |
| Core | Contrats modules/resources, presentation, outils de contenu et media partages | Mutualisation surtout declarative sur plusieurs capacites |
| Securite | RBAC serveur, controle tenant, sanitization au rendu, tokens hashes | JSON-LD Services, controles inegaux, absence de preuve multi-tenant bout en bout |
| SEO/i18n | 4 locales, slugs localises, SSR, recherche PostgreSQL, RSS et sitemaps | Wiring Services, canonicalisation, volumetrie et RTL non valides en execution |
| Exploitation | CI, conteneur, pool DB, healthcheck | Revision non livrable ; etat local ; reprise et charge non demontrees |

## Capacite a devenir un CMS de reference

L'objectif utile n'est pas de maximiser le nombre de modules, mais de rendre les garanties communes plus fortes a chaque module ajoute.

Positionnement credible : **CMS metier multi-tenant, multilingue, integre a Astro, avec domaines fortement types et back-office coherent**. Vouloir simultanement surpasser tous les CMS editoriaux, plateformes headless et outils e-commerce ne constitue pas un critere technique mesurable.

Atouts a conserver : monolithe modulaire, PostgreSQL, relations explicites, traductions relationnelles, media/editor partages, schemas metier distincts. Ne pas reecrire en microservices ni tout remplacer par une table de contenu universelle.

Pour etre de reference dans ce segment, il faut prouver :

1. **Confiance editoriale** : aucun ecrasement silencieux, versions restaurables, workflow et droits coherents, publication previsible.
2. **Experience de bout en bout** : creation, traduction, preview, publication, recherche et restauration sans intervention technique.
3. **Isolation** : tests positifs et negatifs par organisation, role, reference et canal de lecture/ecriture.
4. **Extensibilite** : un troisieme module reutilise les services communs sans copier un nouveau CMS.
5. **Exploitation** : sauvegardes restaurees, observabilite, deploiements repetables, budgets de latence et de cout mesures.
6. **Ecosysteme** : contrats documentes et versionnes, exemples de module, API/webhooks si le positionnement headless l'exige, politique de migrations et de compatibilite.

Les besoins de validation a plusieurs niveaux, de preview partageable, de brouillons de changements sur contenu publie, de permissions par champ, de syndication et de diffusion omnicanale doivent etre specifies. Ils ne sont pas certifies par les contrats actuels et ne sont pas tous necessaires au premier marche cible.

## Trajectoire recommandee

### Lot A - Retablir une reference livrable

Corriger F01/F02, injection JSON-LD, collisions de routes et filtre global. Reparer les tests des contrats sans supprimer les assertions metier. Exiger check, lint, build et tests verts dans un environnement reproductible avec dependances verrouillees.

Sortie : demarrage de l'artefact produit et smoke test public/admin Pages, Blog, Services ; trois navigateurs pour les parcours essentiels.

### Lot B - Stabiliser les garanties CMS

Transactions d'import, verrous atomiques, invalidation protegeant les lectures en cours, snapshots versionnes, transitions compare-and-set et separation des effets secondaires. Uniformiser permissions et politique d'engagement public.

Sortie : tests PostgreSQL a deux connexions ; echec injecte au milieu d'une mutation sans perte ni etat trompeur ; tests cross-tenant et restauration fideles.

### Lot C - Achever Services comme preuve de reutilisation

Galeries, attributs requis, notifications, SEO, traductions et parcours clavier/RTL. Ajouter tests comportementaux des actions Services et integration DB, pas seulement tests des objets de configuration.

Sortie : un redacteur realise tout le parcours sans appeler une action manuellement.

### Lot D - Prouver un troisieme module

Choisir un petit domaine editorial, par exemple Evenements sans billetterie. Implementer un module pilote qui reuse contenu/media, permissions/tenant, workflow, revisions/verrous, recherche, SEO, admin, audit et cache.

Points de branchement centraux acceptables et explicites : bootstrap, schema/migrations, routes et declarations de permissions. En revanche, dupliquer les mecanismes de verrouillage, recherche ou revision est un echec du contrat.

Sortie : tests de conformite reutilisables pour chaque module ; recherche/SEO consomment les adaptateurs ; regles de dependance verifiees en CI.

### Lot E - Valider la montee en charge

1. Instance unique fiable : mesurer p50/p95/p99, requetes, pool, CPU, memoire, cache et volume de medias.
2. Plusieurs replicas : media partage, invalidation distribuee, rate limiting atomique, taches idempotentes, outbox et supervision des workers.
3. Gros catalogues : projections legeres, curseurs, index mesures, sitemaps fragmentes, retention/archivage, quotas par organisation.
4. Extraire un composant seulement lorsqu'un profil de charge ou une contrainte de disponibilite le justifie.

Jeux d'essai proposes, pas capacites promises : 10 000 puis 100 000 contenus, plusieurs tailles de tenants, quatre locales, lectures chaudes/froides, publication concurrente et panne d'un replica. Ajouter une preuve de restauration DB + medias sur environnement vierge. Fixer avec le produit les SLO, RPO et RTO avant de qualifier les resultats.

## Limites restantes et decision

Aucune affirmation de capacite a des millions de contenus, de conformite WCAG ou de securite absolue n'est justifiee par cet audit. Les migrations, les donnees reelles et les parcours navigateur peuvent reveler d'autres problemes apres les blocages initiaux.

**Decision : conserver l'architecture, stabiliser ses contrats executes, terminer Services, puis seulement generaliser avec un module pilote.** L'ambition est compatible avec la direction du projet ; elle n'est pas encore soutenue par une revision livrable ni par une preuve de passage a l'echelle.
