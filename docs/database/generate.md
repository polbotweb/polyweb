# db:generate — Génération de migrations

> **Commande** : `pnpm db:generate`  
> **Fichier** : `src/database/commands/db.generate.ts`

---

## Usage

```bash
pnpm db:generate
```

Génère un fichier de migration SQL à partir des différences entre les schémas Drizzle et l'état actuel des migrations.

---

## Fonctionnement

### 1. Validation de la structure

Vérifie que les fichiers et dossiers requis existent :

- `src/database/` (dossier racine)
- `src/database/schemas.ts` (fichier d'exports)
- `src/database/schemas/` (dossier des schémas)

### 2. Détection des imports manquants

Analyse `schemas.ts` pour détecter les fichiers de schéma dans `schemas/` qui ne sont pas importés :

```text
[INTERACTIF] Fichiers non importés dans schemas.ts :
  [1] my-new-schema.ts
Ajouter des exports ? (ex: 1,2 ou Enter pour ignorer) :
```

Si confirmé, ajoute automatiquement les lignes `export * from './schemas/my-new-schema';` dans `schemas.ts`.

### 3. Initialisation du journal

Crée `src/database/migrations/meta/_journal.json` s'il n'existe pas (nécessaire pour Drizzle Kit).

### 4. Génération via Drizzle Kit

Exécute `npx drizzle-kit generate --config drizzle.config.ts` et affiche les fichiers de migration créés :

```text
[génération] Config: drizzle.config.ts (DB_ENV=LOCAL)
Migrations générées :
  ➜ 0004_add_themes.sql

Pour appliquer : npm run db:migrate
```

---

## Workflow complet

```bash
# 1. Créer ou modifier un schéma
#    → src/database/schemas/my-table.schema.ts

# 2. Exporter depuis schemas.ts (automatique si interactif)
#    → export * from './schemas/my-table.schema';

# 3. Générer la migration
pnpm db:generate

# 4. Vérifier le SQL généré
#    → src/database/migrations/XXXX_*.sql

# 5. Appliquer
pnpm db:migrate

# 6. Appliquer la couche SQL d'infrastructure si nécessaire
pnpm run db:infra
```

---

## Voir aussi

- [create-schemas.md](create-schemas.md) — Guide pour créer un nouveau schéma Drizzle
- [migrate.md](migrate.md) — Appliquer les migrations
- [infra.md](infra.md) — Appliquer les scripts SQL avancés
