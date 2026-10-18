# Créer un schéma Drizzle

Guide pas à pas pour ajouter ou étendre un schéma métier Atomic.

## 1. Créer le fichier de schéma

Les schémas restent sous `src/database/schemas/` et sont regroupés par domaine cohérent.

Pour un module simple :

```text
src/database/schemas/<module>.schema.ts
```

Pour un module riche, plusieurs fichiers peuvent être utilisés lorsque les groupes de tables ont une cohérence claire. Services suit actuellement cette organisation :

```text
src/database/schemas/services.schema.ts
src/database/schemas/services-engagement.schema.ts
```

Le but est la séparation de responsabilité, pas une règle artificielle « une table = un fichier ».

## 2. Exporter depuis `schemas.ts`

Ajoutez les exports dans `src/database/schemas.ts` :

```ts
export * from './schemas/<module>.schema';
```

Les modules peuvent ensuite exposer une façade de domaine, par exemple :

```text
src/modules/services/schema/index.ts
```

qui réexporte les schémas appartenant réellement au module.

## 3. Relations et invariants

Les relations Drizzle restent explicites. Les contraintes structurantes doivent être également exprimées au niveau SQL quand c'est possible : unicité, clés étrangères, checks de cohérence et index.

Les invariants qui nécessitent une connaissance métier plus riche restent dans les Actions/domain helpers et doivent être couverts par des tests.

Exemple Services : catégories hiérarchiques utilisent un invariant applicatif d'acyclicité en plus de la contrainte de non-auto-parentage SQL.

## 4. Générer la migration

```bash
pnpm run db:generate
```

La migration générée ou écrite selon les conventions du projet doit correspondre au schéma source et être enregistrée dans le journal Drizzle.

## 5. Appliquer la migration

```bash
pnpm run db:migrate
```

## Structure actuelle

```text
src/database/
├── schemas.ts
├── schemas/
│   ├── site.schema.ts
│   ├── navigation.schema.ts
│   ├── page.schema.ts
│   ├── audit-log.schema.ts
│   ├── blog.schema.ts
│   ├── services.schema.ts
│   ├── services-engagement.schema.ts
│   └── ...
├── loaders/
│   ├── site.loader.ts
│   ├── navigation.loader.ts
│   ├── page.loader.ts
│   ├── blog.loader.ts
│   └── ...
├── migrations/
│   ├── 0000_*.sql
│   ├── ...
│   └── 0006_services_module.sql
│   └── meta/_journal.json
└── drizzle.ts
```

## Module schema boundary

Un module métier doit conserver ses tables explicites. Il ne faut pas remplacer plusieurs domaines par un grand schéma polymorphique `entityType/entityId` simplement pour réduire le nombre de tables.

Blog et Services utilisent des entités relationnelles explicites, avec leurs traductions, relations, engagement et workflows propres.

## Tenant-scoped schemas

Lorsqu'une table est organisationnelle, sa clé `organizationId` et ses relations doivent respecter la même frontière de tenant que le module. Une mutation qui associe un service, une catégorie, un tag ou un média doit revalider l'appartenance au tenant avant écriture.

## Conventions

- Les noms SQL sont en `snake_case`.
- Les exports TypeScript utilisent le `camelCase` habituel du dépôt.
- Les relations Drizzle restent proches des schémas concernés.
- Les indexes couvrent les lectures réelles : tenant, statut, publication, slug, relations et filtres fréquents.
- Les contraintes critiques doivent exister au niveau SQL lorsqu'elles sont exprimables de façon fiable.
- Les tables d'engagement doivent utiliser les cardinalités métier voulues, par exemple une réaction unique par `(resourceId, userId)`.
- La localisation reste relationnelle, une ligne par ressource et locale.
