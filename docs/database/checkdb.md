# db:check — Vérification de connexion

Vérifie la connexion à la base de données cible, affiche les informations serveur, les tables et les contraintes.

## Commande

```bash
pnpm run db:check
```

## Ce que fait la commande

1. Lit `DB_ENV` (défaut: `LOCAL`) et résout l'URL correspondante via `env.ts`
2. Valide le format de l'URL (`postgresql://` ou `postgres://`) et détecte les placeholders non remplacés
3. Effectue un health check (`SELECT 1`) avec mesure de latence
4. Affiche les métadonnées serveur (`current_database`, `current_user`, `inet_server_addr`)
5. Liste les tables du schéma `public`
6. Liste les contraintes (FK, PK, unique…)

## Variables d'environnement

| Variable | Requis | Description |
| -------- | ------ | ----------- |
| `DB_ENV` | Non | `LOCAL` (défaut), `PROD`, ou `TEST` |
| `DATABASE_URL_LOCAL` | Si DB_ENV=LOCAL | URL PostgreSQL locale |
| `DATABASE_URL_PROD` | Si DB_ENV=PROD | URL PostgreSQL production |
| `DATABASE_URL_TEST` | Si DB_ENV=TEST | URL PostgreSQL de test |

## Comportement de `DB_ENV`

| Cas | Comportement |
| --- | --- |
| `DB_ENV` absent du `.env` | ⚠️ Avertissement + fallback sur `LOCAL` |
| `DB_ENV=` (vide) | ⚠️ Avertissement + fallback sur `LOCAL` |
| `DB_ENV=STAGING` (invalide) | ❌ Erreur lisible + exit — valeurs acceptées affichées |
| `DATABASE_URL_*` manquante | ❌ Erreur lisible + exit — indique quelle variable ajouter |

## Erreurs de connexion

La commande affiche un message lisible (sans stack trace) pour chaque cas :

| Code PG | Message |
| --- | --- |
| `28P01` | ❌ Utilisateur ou mot de passe incorrect |
| `3D000` | ❌ La base n'existe pas |
| `ECONNREFUSED` | ❌ Connexion refusée — le serveur PostgreSQL est-il démarré ? |
| `ENOTFOUND` | ❌ Hôte introuvable |
| Autre | ❌ Message d'erreur PG + code affiché |

## Sécurité PROD

Si `DB_ENV=PROD`, un bandeau rouge s'affiche avec le nom de la base. Les credentials sont toujours masqués (`***@`). La commande est en lecture seule — aucune confirmation demandée.

## Fichiers impliqués

- `src/database/commands/db.check.ts` — script principal
- `src/database/env.ts` — résolution d'environnement et URLs
- `src/database/drizzle.ts` — pool et `checkConnection()`
- `src/database/commands/_utils.ts` — `formatPgError()`, couleurs, `logTarget()`
