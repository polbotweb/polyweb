# Plugins (brique i)

Un plugin Polyweb est **du code installé dans le dépôt** (`src/plugins/<id>/index.ts`), déclaré dans
`src/plugins/index.ts`. Aucun code n'est téléchargé ni évalué dynamiquement : l'admin
(Plateforme → Plugins) ne fait qu'activer/désactiver et régler les plugins installés.

```ts
import { Effect, Schema } from 'effect';
import { definePlugin } from '@/core/plugins/contract';

export default definePlugin<{ label: string }>({
  id: 'mon-plugin',
  name: 'Mon plugin',
  version: '1.0.0',
  description: '…',
  settings: {
    schema: Schema.Struct({ label: Schema.String }),
    defaults: { label: 'Bonjour' },
    fields: [{ name: 'label', label: 'Libellé', kind: 'text' }],
  },
  setup: (ctx) =>
    Effect.gen(function* () {
      yield* ctx.registerBlock({ type: 'monBloc', label: 'Mon bloc', schema, render: (d) => '…' });
      yield* ctx.on('content.published', (event) => Effect.log('publié', event.payload));
      yield* ctx.addCleanup(() => { /* libérer une ressource */ });
    }),
});
```

## Cycle de vie

- `plugin_states` (migration 0017) stocke `enabled`, `settings` (JSON) et `last_error`.
- `syncPlugins` aligne l'instance sur la base ; le middleware l'appelle au plus toutes les
  `PLUGINS_SYNC_INTERVAL_MS` (30 s par défaut), donc une activation se propage aux autres instances.
- `setup` a 10 s maximum. En cas d'échec : tout ce qui a été enregistré est annulé, l'erreur est
  stockée dans `last_error` et affichée dans l'admin ; le site continue.
- Désactivation (ou changement de réglages) : les blocs et abonnements sont retirés, puis `setup`
  est rejoué avec les nouveaux réglages.
- Les handlers d'événements tournent sur le runtime partagé avec un délai maximal
  (`PLUGINS_HANDLER_TIMEOUT_MS`, 15 s) ; leurs erreurs sont journalisées, jamais propagées.

## Plugins fournis

| id | rôle |
|----|------|
| `faq-block` | bloc « question / réponse » (`<details>`) pour les contenus à blocs |
| `form-autoreply` | accusé de réception par e-mail après `form.submitted` (texte fixe défini par l'admin, jamais les données soumises) |

## Limites connues

- Pas de routes HTTP ni de pages ajoutées par plugin (le routage Astro est figé à la compilation).
- Réglages globaux (pas par site).
- Un contenu qui utilise le bloc d'un plugin désactivé ne peut plus être ré-enregistré tant que le
  plugin n'est pas réactivé (type de bloc inconnu) ; le rendu ignore ce bloc.
