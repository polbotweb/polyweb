# core/numbering — numérotation des documents

Bloc générique (`src/core/numbering`) pour les numéros de devis, factures, avoirs, bons de commande… : une séquence **sans trou** par tenant, type de document et période.

## Motifs

Texte libre + jetons `{prefix}`, `{YYYY}`, `{YY}`, `{MM}`, `{seq}` / `{seq:N}` (N = 1..12, complété par des zéros). `{seq}` est obligatoire et unique ; tout autre jeton est refusé (`InvalidNumberingPatternError`).

| Schéma | Date | Valeur | Numéro |
|---|---|---|---|
| `{prefix}-{YYYY}-{seq:5}`, préfixe `FA`, remise annuelle | 2026-10-26 | 42 | `FA-2026-00042` |
| `AV{YY}{MM}/{seq:3}`, remise mensuelle | 2026-03-01 | 7 | `AV2603/007` |

Remise à zéro (`reset`) : `never` (période `""`), `yearly` (`2026`), `monthly` (`2026-10`).

## Attribution

```ts
await db.transaction((tx) => Effect.runPromise(Effect.gen(function* () {
  const { number } = yield* assignDocumentNumber(tx, { organizationId, key: "invoice", scheme, date });
  // insérer le document avec `number` dans la MÊME transaction
})));
```

Table `document_sequences` (migration `0030_document_sequences`), unique `(organization_id, key, period)` NULLS NOT DISTINCT. `INSERT … ON CONFLICT DO UPDATE SET last_value = last_value + 1 RETURNING` verrouille la ligne jusqu'au commit : créations concurrentes sérialisées, rollback = numéro non consommé.

Tests : `tests/unit/core/numbering.test.ts`, `tests/integration/numbering.test.ts` (20 transactions concurrentes, rollback, périodes).
