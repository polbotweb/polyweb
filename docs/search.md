# Recherche (brique k)

Service Effect `SearchIndex` (`src/lib/search/`) avec pilotes interchangeables :

| `SEARCH_DRIVER` | Recherche serveur | Notes |
|---|---|---|
| `postgres` (défaut) | table `search_documents` (migration 0018), `tsvector` pondéré (titre A, résumé B, corps C), config par langue | aucune dépendance |
| `meilisearch` | API HTTP Meilisearch (`MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`, `MEILISEARCH_INDEX`, `SEARCH_TIMEOUT_MS`) | délais + reprises (réseau/5xx/429), attente des tâches |
| `pagefind` | Postgres côté serveur **+** export statique `pnpm search:pagefind` | index Pagefind dans `dist/client/pagefind` (ou `--out`) |

Documents indexés : entrées de contenu publiées (tous sites, une ligne par langue), et pour le
site par défaut les articles, services et pages publiés (organisation NULL).

- Indexation automatique sur `content.created/updated/published/unpublished/deleted`
  (`SEARCH_AUTO_INDEX=false` pour désactiver).
- Réindexation complète : `pnpm search:reindex [--site slug]` ou `POST /api/cron/search-reindex` (CRON_SECRET).
- API : `GET /api/v1/search?q=&locale=&kind=content,page&type=&limit=&offset=` — anonyme (limité)
  ou jeton `search:read`. `highlight` est du HTML sûr (texte échappé + `<mark>`).
- L'ancien `GET /api/search` (atomic, blog/services/pages) est conservé tel quel.

Tests : `tests/integration/search/search.test.ts` (Postgres, Pagefind, et Meilisearch réel si
`MEILI_TEST_BIN` pointe vers un binaire `meilisearch`).

Limites : les articles/services ne sont réindexés que par `search:reindex` (pas d'événement émis
par ces modules historiques) ; l'endpoint n'est pas encore décrit dans le document OpenAPI.
