# db:seed — Insertion des données initiales

Insère les données définies dans le manifest de seed dans la base cible.

## Commande

```bash
pnpm run db:seed            # insert les données (onConflictDoNothing)
pnpm run db:seed -- --reset # vide toutes les tables avant d'insérer
```

## Ce que fait la commande

1. Lit `DB_ENV` et résout l'URL via `env.ts`
2. Si `DB_ENV=PROD` → demande confirmation
3. Si `--reset` → demande une confirmation destructive, puis vide (TRUNCATE) toutes les tables via `truncateAllTables()`
4. Parcourt le manifest (`src/database/data/manifest.ts`) dans l'ordre
5. Pour chaque entrée :
   - Résout l'export de schéma dans `schemas.ts`
   - Importe dynamiquement le fichier de données
   - Normalise les valeurs (booléens → 0/1, tableaux → JSON)
   - Insère avec `onConflictDoNothing()`

## Manifest

Le seed utilise un **manifest explicite** (pas de matching magique). Chaque entrée déclare :

```ts
{
  dataFile: '01-users.data.ts',    // fichier dans src/database/data/
  schemaExport: 'users',           // nom de l'export dans schemas.ts
  label: 'users',                  // label pour les logs
}
```

L'ordre du tableau détermine l'ordre d'insertion — respectez les dépendances FK.

## Flag `--reset`

Vide (TRUNCATE) toutes les tables avant le seed. Utile pour repartir d'un état propre sans supprimer les tables (contrairement à `db:reset` qui les DROP).

## Variables d'environnement

| Variable | Requis | Description |
| --- | --- | --- |
| `DB_ENV` | Non | `LOCAL` (défaut), `PROD`, ou `TEST` |
| `DATABASE_URL_*` | Oui | URL correspondant à `DB_ENV` |
| `CONFIRM_PROD` | Non | `oui` pour skip le prompt interactif |

> Si `DB_ENV` est absent ou vide → avertissement + fallback sur `LOCAL`.  
> Si `DB_ENV` est invalide ou l'URL manquante → message d'erreur lisible + exit (pas de stack trace).

## Fichiers impliqués

- `src/database/commands/db.seed.ts` — script principal
- `src/database/data/manifest.ts` — manifest de seed (ordre + mapping)
- `src/database/data/*.data.ts` — fichiers de données
- `src/database/schemas.ts` — index des exports de schémas
- `src/database/drizzle.ts` — pool et `getDrizzle()`
- `src/database/commands/_utils.ts` — confirmations, `truncateAllTables()`
