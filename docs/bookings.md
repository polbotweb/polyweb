# Module réservations (`src/modules/bookings`)

Ressources réservables (salles, personnes, équipements), plages d'ouverture hebdomadaires et réservations sans chevauchement, multi-tenant. Les calculs de créneaux sont un bloc générique du cœur : `src/core/scheduling`.

## Bloc générique `core/scheduling`

- Intervalles semi-ouverts `[start, end)` : `overlaps`, `durationMinutes`.
- Plages hebdomadaires `{ weekday, start, end }` (0 = dimanche, heures `HH:MM`, `24:00` autorisé) : `validWindows`, `windowsOn`, `withinWindows` (plages contiguës fusionnées, créneau à cheval sur minuit accepté).
- Fuseaux IANA : `isTimeZone`, `zonedToUtc` (heure inexistante lors d'un passage à l'heure d'été → décalée après le saut), `localDate`, `localTime`, `localParts`, `formatZoned`.
- `freeSlots(date, windows, zone, busy, slotMinutes, notBefore?)` : créneaux libres d'un jour local.

## Cycle de vie d'une réservation

`REQUESTED → CONFIRMED → CHECKED_IN → COMPLETED`

- Une réservation confirmée peut revenir à « demandée ». On peut annuler depuis `REQUESTED` ou `CONFIRMED`, et marquer « absent » (`NO_SHOW`) depuis `CONFIRMED`.
- Le **numéro de réservation** est attribué à la première confirmation via `core/numbering`. La clé est `bookings.booking` et le schéma par défaut `RES-{YYYY}-{seq:5}`, sans trou et remis à zéro chaque année. Une réservation déjà numérotée garde son numéro.
- Statuts actifs (qui occupent le créneau) : `REQUESTED`, `CONFIRMED`, `CHECKED_IN`. Seules les réservations demandées ou confirmées sont modifiables ; seules les demandées ou annulées peuvent être supprimées.

## Règles de créneau

- Le créneau doit se trouver dans les plages d'ouverture de la ressource (si elle en a), dans son fuseau horaire. Sans plage, la ressource est ouverte en permanence.
- Durée de 5 minutes à 7 jours ; nombre de personnes ≤ capacité de la ressource.
- Pas de chevauchement avec une autre réservation active de la même ressource. L'extension PostgreSQL `btree_gist` n'étant pas disponible, l'exclusion est garantie en verrouillant la ligne de la ressource (`SELECT … FOR UPDATE`) avant la vérification, dans la même transaction que l'écriture ; le test d'intégration lance des créations concurrentes et vérifie qu'une seule aboutit.
- Une ressource ne peut pas descendre sous la taille d'un groupe déjà réservé (actif), ni être supprimée tant qu'elle a des réservations.
- Le créneau se saisit soit en instants ISO (`startsAt` / `endsAt`), soit en date + heure locales de la ressource + durée.

## Domaine (pur, `domain/`)

- `workflow.ts` : transitions, `nextStatuses`, statuts actifs / modifiables, `assignsNumber`.
- `numbering.ts` : numérotation des réservations.
- `resource.ts` : validation des ressources (code normalisé en majuscules, fuseau, pas de créneau, plages).
- `booking.ts` : validation des réservations, `checkSlot` (ouverture puis chevauchement), `bookingLabel`.
- `errors.ts` : erreurs du domaine.

## Données

- La migration `0036` crée les tables `bookings_resources`, `bookings`, `bookings_revisions` et `bookings_locks`. La clé étrangère réservation → ressource est différée (`DEFERRABLE INITIALLY DEFERRED`), comme pour les autres modules.
- Les instants sont stockés en `timestamptz` ; les plages d'ouverture en `jsonb`.
- Les lectures (y compris les disponibilités) passent par `loaders/` et les écritures par `services/`.

## Actions (`actions.bookings.*`)

- Réservations : `create`, `update`, `transition`, `delete`, `lock`, `unlock`, `bulk` (annuler, absent, terminer).
- Ressources : `createResource`, `updateResource`, `deleteResource`.
- `availability` : créneaux libres d'une ressource pour une date (à partir de maintenant).

Les permissions `bookings:create | read | update | delete` sont vérifiées pour l'organisation de la fiche (tenant).

## Administration

- `/{lang}/admin/bookings` : liste des réservations, avec recherche (client, e-mail, numéro, ressource), filtre de statut, tris (début, création, numéro), vues enregistrées et actions groupées.
- `/{lang}/admin/bookings/new` et `/{lang}/admin/bookings/{id}/edit` : formulaire de réservation, avec la liste des créneaux libres à la demande.
- `/{lang}/admin/bookings/{id}` : fiche de la réservation, avec les transitions et le numéro.
- `/{lang}/admin/bookings/resources` : ressources (liste et création, éditeur de plages d'ouverture).
- `/{lang}/admin/bookings/resources/{id}?date=YYYY-MM-DD` : disponibilités du jour et édition de la ressource.

Les traductions existent en fr, en, es et ar (`i18n/`), avec une interface RTL en arabe. Le script client est `client/init.ts` (formulaires, créneaux et actions de fiche).

## Parcours public (visiteur)

Pages SSR sans JavaScript requis (formulaires HTML, `POST` puis redirection 303), en fr, en, es et ar (RTL). Elles existent pour la plateforme et pour chaque organisation :

- `/{lang}/bookings` et `/{lang}/{organisation}/bookings` : ressources actives du tenant.
- `/{lang}/[{organisation}/]bookings/{CODE}?date=YYYY-MM-DD` : créneaux libres du jour, puis formulaire visiteur (nom et e-mail obligatoires, téléphone, nombre de personnes et note facultatifs). Les dates sont limitées à aujourd'hui + 180 jours, dans le fuseau de la ressource.
- `/{lang}/[{organisation}/]bookings/manage/{id}?t={jeton}` : récapitulatif et annulation par lien signé.

Le code est dans `public/` (`flow.ts` pour les effets, `pages.ts` pour les contrôleurs de page, `paths.ts`, `format.ts` et `email.ts` pour les fonctions pures), `domain/guest.ts` et `src/components/bookings/public/`.

- **Créneaux** : plages d'ouverture moins les réservations actives (`freeSlots`). À l'envoi, `bookingsService.createGuestBooking` reprend le verrou transactionnel de la ressource, recalcule les créneaux et exige que le début demandé en fasse partie. Sinon, la réponse est `SlotUnavailableError` (HTTP 409, « créneau déjà pris »). La réservation est créée au statut `REQUESTED`.
- **Validation** : toutes les erreurs sont renvoyées d'un coup (HTTP 422). Un récapitulatif lié aux champs s'affiche, avec `aria-invalid` et `aria-describedby`, et les valeurs saisies sont conservées.
- **Anti-abus** : les mêmes mécanismes que les formulaires publics.
  - Contrôle d'origine (CSRF) par le middleware.
  - Pot de miel `_hp` et jeton horodaté signé `_ts` (2 s minimum). Un robot détecté reçoit un faux succès et rien n'est écrit.
  - Limite de débit par IP hachée et par tenant : `BOOKING_RATE_LIMIT` envois par 10 minutes (10 par défaut), avec HTTP 429 et `Retry-After`.
- **E-mail de confirmation** : envoyé par le service `Mailer` (infrastructure SMTP existante), en HTML et en texte, localisé, en RTL pour l'arabe. Il contient le lien de gestion. Un échec ou un délai de plus de 10 s ne bloque pas la réservation : la page de confirmation invite alors à conserver le lien affiché.
- **Lien signé** : `HMAC(signingSecret, id)` tronqué, comparé à temps constant. Un jeton invalide ou un autre tenant donne une 404, sans révéler si la réservation existe.
  - La page est servie en `no-store` et `noindex`, avec `<meta name="referrer" content="same-origin">`, pour que le jeton ne parte jamais vers un tiers.
  - `no-referrer` n'est pas utilisé : il ferait envoyer `Origin: null` et le contrôle d'origine refuserait le `POST` d'annulation.
- **Annulation** : possible si la réservation est `REQUESTED` ou `CONFIRMED` et pas encore commencée. Elle est idempotente.
- **Journal d'audit** : les événements `BOOKING_PUBLIC_CREATE` et `BOOKING_PUBLIC_CANCEL` sont enregistrés. Les réservations visiteur n'ont pas de révision, car une révision exige un auteur utilisateur ; le journal d'audit en tient lieu.
- **Acompte et paiement** : hors périmètre. Le module `payments` (Stripe ou simulé, `PAYMENTS_ENABLED`) existe, mais aucun acompte n'est encore relié aux réservations.

## Limites

- Le parcours public ne prend ni acompte ni paiement, et n'envoie pas de rappel avant le rendez-vous.
- Pas d'exceptions de calendrier (jours fériés, fermetures ponctuelles) ni de récurrence de réservations.

## Tests

- `tests/unit/bookings/*.test.ts` (dont `scheduling.test.ts` : heure d'été, plages contiguës, minuit)
- `tests/integration/bookings-module.test.ts`
- `tests/integration/bookings-public.test.ts` (parcours public : revérification, concurrence, anti-robots, débit, lien signé, annulation, tenant)
- `tests/e2e/bookings-admin.spec.ts`
- `tests/e2e/bookings-public.spec.ts` (3 navigateurs : réservation, annulation, RTL, CSRF, organisation, axe)
- pa11y et Lighthouse : `/{lang}/bookings` et `/{lang}/bookings/A11YROOM`, ressource créée par `tests/a11y/setup.ts`
- `tests/e2e/a11y.spec.ts` (pages réservations)

## Acompte en ligne

Acompte configurable par ressource ; exigé à la réservation publique quand le paiement en ligne
est actif (échéance 60 min, puis statut système `EXPIRED`). Détails : [payments.md](payments.md).
