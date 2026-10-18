# db:compare — Comparaison entre environnements

Compare la structure (tables, colonnes) et les données entre deux bases quelconques (LOCAL, PROD, TEST).

## Commande

```bash
pnpm db:compare                # compare les 3 paires : LOCAL↔PROD, LOCAL↔TEST, TEST↔PROD
pnpm db:compare <ENV_A> <ENV_B> # compare une paire spécifique
```

Exemples :

```bash
pnpm db:compare               # full scan des 3 combinaisons
pnpm db:compare LOCAL PROD    # compare LOCAL ↔ PROD
pnpm db:compare LOCAL TEST    # compare LOCAL ↔ TEST
pnpm db:compare TEST PROD     # compare TEST ↔ PROD
```

## Ce que fait la commande

1. Sans argument → compare les 3 paires ; avec 2 arguments → compare la paire demandée
2. Se connecte **une seule fois** par environnement nécessaire (pas de connexions dupliquées)
3. Pour chaque paire :
   - **Étape 1** — Compare les tables (uniquement dans l'une ou l'autre)
   - **Étape 2** — Compare les colonnes (nom + type) table par table
   - **Étape 3** — Compare les données des tables communes ligne à ligne (JSON diff)
4. En mode full scan : affiche un **résumé global** des 3 paires à la fin

## Variables d'environnement

| Variable | Requis si utilisé | Description |
| --- | --- | --- |
| `DATABASE_URL_LOCAL` | Oui | URL PostgreSQL locale |
| `DATABASE_URL_PROD` | Oui | URL PostgreSQL production |
| `DATABASE_URL_TEST` | Oui | URL PostgreSQL test |

> Seules les URLs des environnements effectivement utilisés sont exigées (les 3 en mode full scan).
> `DB_ENV` n'est pas utilisé — la commande utilise les arguments explicites.

## Erreurs d'arguments

```md
❌ Usage : pnpm db:compare [ENV_A ENV_B]
   Environnements disponibles : LOCAL, PROD, TEST
   Sans argument : compare les 3 paires
```

Erreurs gérées : nombre d'arguments incorrect, environnement invalide, deux fois le même.

## Erreurs de connexion

Chaque base est testée indépendamment. En cas d'échec :

```md
✔ [LOCAL] Connecté à atomic_local (user: postgres)
✖ [PROD] Utilisateur ou mot de passe incorrect
   URL : postgresql://***@localhost:5432/atomic_prod
   → Vérifiez user/password dans .env

❌ Connexion impossible : PROD
   Corrigez les identifiants/URLs ci-dessus dans .env puis relancez.
```

Messages couverts : mot de passe incorrect, base inexistante, serveur arrêté, hôte introuvable, timeout.

## Sécurité

- Commande en **lecture seule** sur les deux bases
- Les credentials sont masqués dans les logs

## Fichiers impliqués

- `src/database/commands/db.compare.ts` — script principal
- `src/database/env.ts` — `getDbUrl()`, `maskUrl()`, `dbNameFromUrl()`
- `src/database/commands/_utils.ts` — `safeConnect()`, `formatPgError()`, couleurs
