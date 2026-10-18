# db:sync — Synchronisation entre deux environnements

Copie toutes les données d'une base source vers une base cible (n'importe quelle paire parmi LOCAL, PROD, TEST).

## Commande

```bash
pnpm db:sync <SOURCE> <TARGET>
```

Exemples :

```bash
pnpm db:sync LOCAL PROD    # écrase PROD avec les données de LOCAL
pnpm db:sync PROD LOCAL    # écrase LOCAL avec les données de PROD
pnpm db:sync LOCAL TEST    # écrase TEST avec les données de LOCAL
pnpm db:sync TEST PROD     # écrase PROD avec les données de TEST
```

## Ce que fait la commande

1. Parse les deux arguments (environnements valides : `LOCAL`, `PROD`, `TEST`)
2. Résout les URLs correspondantes via `env.ts`
3. Demande une confirmation destructive (`confirmDestructive()`)
4. Se connecte aux deux bases via `safeConnect()` — chaque connexion est testée individuellement
5. Désactive les contraintes FK (`session_replication_role = replica`)
6. Pour chaque table dans la base source :
   - TRUNCATE la table cible
   - INSERT toutes les lignes de la source
7. Réactive les contraintes FK

## Variables d'environnement

| Variable | Requis si utilisé | Description |
|---|---|---|
| `DATABASE_URL_LOCAL` | Oui | URL PostgreSQL locale |
| `DATABASE_URL_PROD` | Oui | URL PostgreSQL production |
| `DATABASE_URL_TEST` | Oui | URL PostgreSQL test |

> Seules les URLs des deux environnements passés en argument sont exigées.
> Si une URL est manquante → message d'erreur lisible + exit.

## Erreurs d'arguments

```
❌ Usage : pnpm db:sync <SOURCE> <TARGET>
   Environnements disponibles : LOCAL, PROD, TEST
   Exemple : pnpm db:sync LOCAL PROD   (écrase PROD avec LOCAL)
```

Erreurs gérées : arguments manquants, environnement invalide, source = cible.

## Erreurs de connexion

Chaque base est testée indépendamment après la confirmation. Les erreurs PG sont formatées proprement (mot de passe, base inexistante, serveur arrêté, hôte introuvable, timeout) avec indication de la variable à corriger dans `.env`.

## Sécurité

- Confirmation destructive **toujours** demandée (quelle que soit la direction)
- Les credentials sont masqués dans les logs

## Fichiers impliqués

- `src/database/commands/db.sync.ts` — script principal
- `src/database/env.ts` — `getDbUrl()`, `maskUrl()`
- `src/database/commands/_utils.ts` — `safeConnect()`, `confirmDestructive()`, `formatPgError()`
