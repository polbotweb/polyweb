# Sauvegarde et restauration (brique m)

```bash
pnpm db:backup [--out backups] [--media] [--keep 7]
pnpm db:restore backups/polyweb-20261018-091525Z.tar.gz [--media] [--yes] [--verify-only]
```

Archive `polyweb-<horodatage>.tar.gz` :

- `manifest.json` — format, date, version (`POLYWEB_RELEASE`), migrations appliquées, sha256 et taille du dump, médias ;
- `db.dump` — `pg_dump --format=custom --no-owner --no-privileges` ;
- `media/…` — avec `--media`, tous les objets du Storage (local, S3 ou R2).

Restauration :

1. vérifie l'archive (chemins interdits `..`/absolus, manifest validé par Schema, sha256) ;
2. refuse une sauvegarde contenant des migrations inconnues du code (mettre le code à jour d'abord) ;
3. demande confirmation (`--yes` en local ; en production `CONFIRM_PROD=oui` reste obligatoire) ;
4. `DROP SCHEMA public CASCADE` puis `pg_restore --single-transaction --exit-on-error` ;
5. avec `--media`, réécrit les objets dans le Storage configuré ;
6. si le code est plus récent : `pnpm db:migrate`.

Variables : `BACKUP_DIR` (défaut `backups/`, ignoré par git), `BACKUP_KEEP`. Requiert `pg_dump`,
`pg_restore`, `psql` et `tar` (même version majeure de Postgres que le serveur, ou plus récente).
Les identifiants passent par `PGPASSWORD` & co, jamais en argument.

Limites : pas de chiffrement de l'archive ni d'envoi automatique hors machine (le bucket médias est
public : ne pas y stocker les sauvegardes) — à planifier avec un outil externe (cron + rclone/restic).
Tests : `tests/integration/backup/backup.test.ts` (restauration réelle si `RESTORE_TEST_DATABASE_URL`).
