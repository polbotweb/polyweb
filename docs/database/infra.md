# db:infra — Application des scripts SQL d'infrastructure

Applique les scripts SQL idempotents présents dans `src/database/infra/` après les migrations Drizzle.

## Commande

```bash
pnpm run db:infra                # applique les scripts
pnpm run db:infra -- --dry-run   # affiche les statements sans les exécuter
```

## Quand l'utiliser

Utiliser `db:infra` pour tout ce qui ne doit pas vivre dans les schémas Drizzle eux-mêmes :

- fonctions SQL utilitaires
- triggers
- indexes avancés
- contraintes additionnelles
- futures policies RLS

## Ce que fait la commande

1. Lit `DB_ENV` et résout la base cible via `env.ts`
2. Si `DB_ENV=PROD` → demande confirmation (`CONFIRM_PROD=oui` ou prompt interactif)
3. Lit les fichiers `.sql` dans `src/database/infra/` par ordre alphabétique
4. Découpe chaque fichier sur les marqueurs `--> statement-breakpoint`
5. Exécute chaque fichier dans une transaction dédiée
6. Stoppe au premier échec pour éviter un état partiellement appliqué dans le fichier courant

## Workflow recommandé

```bash
# 1. Modifier les schémas Drizzle si la structure change
pnpm db:generate

# 2. Appliquer les migrations structurelles
pnpm run db:migrate

# 3. Appliquer la couche SQL d'infrastructure
pnpm run db:infra
```

## Convention de fichiers

- Préfixer les fichiers pour garder un ordre stable : `00-`, `01-`, `02-`, etc.
- Écrire du SQL idempotent quand c'est possible (`IF NOT EXISTS`, `CREATE OR REPLACE`, blocs `DO $$`)
- Séparer les statements avec `--> statement-breakpoint`

Exemple :

```sql
CREATE OR REPLACE FUNCTION my_function()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN;
END;
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS my_table_example_idx ON my_table (example);
```

## Fichiers impliqués

- `src/database/commands/db.infra.ts` — script principal
- `src/database/infra/*.sql` — scripts SQL avancés
- `src/database/env.ts` — résolution d'URLs
- `src/database/drizzle.ts` — pool et `getPgClient()`
- `src/database/commands/_utils.ts` — `confirmProd()` et logs d'environnement

## Voir aussi

- [generate.md](generate.md) — Générer les migrations structurelles
- [migrate.md](migrate.md) — Appliquer les migrations Drizzle
