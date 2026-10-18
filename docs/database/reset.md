# db:reset — Reset complet de la base

> **Commande** : `pnpm db:reset`  
> **Fichier** : `src/database/commands/db.reset.ts`

---

## Usage

```bash
pnpm db:reset
```

⚠️ **Opération destructive** — supprime toutes les tables et l'historique des migrations. Nécessite une confirmation interactive.

---

## Fonctionnement

1. **Affichage du contexte** : nom de la base, cible (LOCAL/STAGING/PROD)
2. **Confirmation** : demande une saisie explicite avant de procéder
3. **Suppression des tables** : via `resetAllTables(client)` (DROP CASCADE)
4. **Reset des migrations** : `DELETE FROM __drizzle_migrations` (historique Drizzle Kit)

### Sortie

```text
═══════════════════════════════════════════════════════
   🗑️  Reset Database — atomic_dev
═══════════════════════════════════════════════════════

[cible] LOCAL (postgresql://localhost:5432/atomic_dev)
⚠️  RESET COMPLET (suppression de toutes les tables + historique migrations)
Tapez "OUI" pour confirmer : OUI

  ⟳ Historique des migrations réinitialisé.

✔️  Reset complet.
```

---

## Quand utiliser

| Situation | Commande |
| :-- | :-- |
| Repartir de zéro (dev) | `pnpm db:reset` puis `pnpm db:migrate` puis `pnpm db:seed` |
| Corriger une migration cassée | `pnpm db:reset` puis `pnpm db:migrate` |
| Supprimer toutes les données (dev) | `pnpm db:reset` |

---

## ⚠️ Protection production

La commande demande une confirmation texte. En production (`DB_ENV=PROD`), une confirmation supplémentaire est requise.

---

## Voir aussi

- [migrate.md](migrate.md) — Appliquer les migrations après un reset
- [seed.md](seed.md) — Re-seeder la base après un reset
