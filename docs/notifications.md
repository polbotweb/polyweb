# Notifications

Bloc core générique (`src/core/notifications`) : notifications in-app, e-mails transactionnels via
une outbox, préférences par catégorie et par canal, désinscription par lien signé et relances
planifiées. Les modules déclarent leurs types ; le core gère stockage, préférences, envoi et pages.

## Déclarer les notifications d'un module

`pnpm module:new <nom>` génère `src/modules/<nom>/notifications/definitions.ts` et l'inscrit dans
`src/modules/notifications.ts` entre les marqueurs `// @module-notifications:*` (idempotent).

```ts
export const salesNotifications = defineModuleNotifications(
  "sales",
  [{ type: "INVOICE_REMINDER_SENT", category: "billing", channels: ["in_app"] }], // types
  [invoiceReminderEmail],   // gabarits e-mail (defineEmailTemplate), optionnel
  [invoiceReminderSource],  // sources de relance (ReminderSource), optionnel
);
```

Libellés : `types["<module>:<TYPE>"]` dans `src/core/notifications/i18n.ts` (fr/en/es/ar, clés
identiques vérifiées par test). Sans libellé, la liste affiche le titre stocké, puis la catégorie.

## API

| Fonction | Rôle |
| --- | --- |
| `notify(input, tx?)` | notification in-app, respecte la préférence `category:in_app`, dédupliquée par `dedupeKey` |
| `enqueueEmail(input, tx?)` | e-mail dans l'outbox (même transaction que l'écriture métier) ; avec `userId`, respecte la préférence `category:email` et ajoute le lien de désinscription |
| `processEmailOutbox()` | envoi avec reprise exponentielle (`EMAIL_OUTBOX_MAX_ATTEMPTS`) |
| `cancelPendingEmails(keys)` | annule des e-mails non encore envoyés |
| `runReminders({ now, only })` | exécute les sources de relance ; l'échec d'une source n'arrête pas les autres |
| `listNotifications` / `unreadNotificationCount` / `markNotificationsRead` | lecture et accusé de lecture, toujours limités à l'utilisateur courant |

Les événements du bus (`subscriber.ts`) créent aussi des notifications pour les définitions qui
déclarent un `event`.

## Crons (Bearer `CRON_SECRET`)

| Route | Fréquence | Rôle |
| --- | --- | --- |
| `POST /api/cron/notifications` | chaque minute | envoie l'outbox e-mail |
| `POST /api/cron/reminders` | quotidienne | relances (`sales.invoices` : factures échues, une relance par niveau, idempotente) |

## Pages

- `/{lang}/notifications` : liste paginée (20), filtre « non lues », tout marquer comme lu (POST + redirection 303).
- `/{lang}/notifications/preferences` : cases à cocher par catégorie et canal.
- `/{lang}/notifications/unsubscribe?token=` : désinscription par jeton HMAC (60 jours), sans connexion.
- Cloche de la barre latérale du compte : nombre de non-lues (texte pour lecteurs d'écran).

Toutes sont `noindex`, `Cache-Control: private, no-store`, et figurent dans les listes pa11y et Lighthouse.

## Limites connues

- Pas de désinscription « one-click » RFC 8058 (POST sans Origin) : elle demanderait une exemption CSRF, à décider.
- Les relances de facture (`sales.invoice-reminder`) sont des e-mails de recouvrement : pas de lien de
  désinscription, locale par défaut.
