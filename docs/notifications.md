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

## Notifications optionnelles et transactionnelles

- **Optionnelle** (par défaut) : soumise aux préférences catégorie × canal ; un e-mail adressé à un
  utilisateur porte un lien de désinscription (page de confirmation) et les en-têtes RFC 8058.
- **Transactionnelle** (`transactional: true` dans la définition, canal `email` seul) : liée à
  l'exécution d'un service — ex. `INVOICE_REMINDER_DUE` (relance de facture au client). Jamais soumise
  aux préférences, sans lien ni en-tête de désinscription, absente de la page de préférences. Un même
  gabarit ne peut pas être à la fois transactionnel et optionnel (contrôlé à l'enregistrement).
- L'alerte interne `INVOICE_REMINDER_SENT` (in-app, auteur de la facture) reste optionnelle (`billing`).
- Qualifier un message de transactionnel est un choix produit par type de message ; ce n'est pas une
  qualification juridique automatique.

## Désinscription « un clic » (RFC 8058)

- En-têtes des e-mails optionnels : `List-Unsubscribe: <https://…/api/notifications/unsubscribe/one-click?token=…&lang=…>`
  (une seule cible HTTPS, celle du POST) et `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
  Le lien du corps de l'e-mail pointe vers la page humaine `/{lang}/notifications/unsubscribe`.
- `POST /api/notifications/unsubscribe/one-click?token=…` : seul chemin exempté du contrôle d'Origin
  (`src/lib/security/origin-check.ts`), et seulement en `POST` + `application/x-www-form-urlencoded`.
  Le handler exige : Host = hôte de `SITE_URL`, corps exact `List-Unsubscribe=One-Click`, jeton HMAC
  valide et non expiré pour le canal `email`. Aucune session ni cookie lus ou posés ; réponse `no-store`.
- Rejouable : désactivation idempotente du canal e-mail de la catégorie ; un jeton ne réactive jamais.
- `GET` sur cette URL : aucun effet, redirection 303 vers la page de confirmation.
- Prérequis d'infrastructure (non vérifié par le code) : la signature DKIM du serveur d'envoi doit
  couvrir `List-Unsubscribe` et `List-Unsubscribe-Post` pour que les messageries honorent le « un clic ».

## Langue des relances de facture

`defaultLocale` du premier site (ordre de création) de l'organisation émettrice, validée parmi
fr/en/es/ar, sinon `DEFAULT_LOCALE`. Le lien de paiement suit la même langue. Aucune langue n'est
stockée par client (pas de migration).

## Limites connues

- Les relances d'une facture sans organisation (plateforme) sont envoyées dans la langue par défaut.
