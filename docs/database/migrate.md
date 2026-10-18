# db:migrate — Application des migrations SQL

Applique les fichiers de migration SQL générés par `db:generate` sur la base cible.

## Commande

```bash
pnpm run db:migrate            # applique les migrations en attente
pnpm run db:migrate -- --reset # supprime TOUTES les tables puis applique toutes les migrations
```

## Ce que fait la commande

1. Lit `DB_ENV` et résout l'URL via `env.ts`
2. Si `DB_ENV=PROD` → demande confirmation (`CONFIRM_PROD=oui` ou prompt interactif)
3. Si `--reset` → demande une confirmation destructive, supprime toutes les tables via `resetAllTables()`, puis efface le journal `__drizzle_migrations`
4. Crée la table `__drizzle_migrations` si elle n'existe pas
5. Compare les fichiers `.sql` dans `src/database/migrations/` avec le journal
6. Applique chaque migration SQL en attente (statement par statement, transaction par statement)
7. Enregistre chaque migration appliquée dans `__drizzle_migrations`
8. Si le projet utilise `src/database/infra/`, appliquer ensuite `pnpm run db:infra` pour la couche SQL avancée hors Drizzle

## Flag `--reset`

Supprime toutes les tables + l'historique des migrations, puis applique tout depuis zéro. Équivalent à un `db:reset` suivi de `db:migrate`.

**Confirmation requise** : toujours demandée (en PROD via `confirmProd`, sinon via `confirmDestructive`).

## Variables d'environnement

| Variable | Requis | Description |
| --- | --- | --- |
| `DB_ENV` | Non | `LOCAL` (défaut), `PROD`, ou `TEST` |
| `DATABASE_URL_*` | Oui | URL correspondant à `DB_ENV` |
| `CONFIRM_PROD` | Non | `oui` pour skip le prompt interactif en CI/CD |

> Si `DB_ENV` est absent ou vide → avertissement + fallback sur `LOCAL`.  
> Si `DB_ENV` est invalide ou l'URL manquante → message d'erreur lisible + exit (pas de stack trace).

## Fichiers impliqués

- `src/database/commands/db.migrate.ts` — script principal
- `src/database/migrations/*.sql` — fichiers de migration générés par `db:generate`
- `src/database/migrations/meta/_journal.json` — journal Drizzle Kit
- `src/database/env.ts` — résolution d'URLs
- `src/database/drizzle.ts` — pool et `getPgClient()`
- `src/database/commands/_utils.ts` — `confirmProd()`, `confirmDestructive()`, `resetAllTables()`

## Voir aussi

- [infra.md](infra.md) — Appliquer la couche SQL d'infrastructure
