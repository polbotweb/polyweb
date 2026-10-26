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

## Limites

- Pas encore de parcours de réservation public (côté visiteur) : la prise de réservation se fait depuis le back-office.
- Pas d'exceptions de calendrier (jours fériés, fermetures ponctuelles) ni de récurrence de réservations.

## Tests

- `tests/unit/bookings/*.test.ts` (dont `scheduling.test.ts` : heure d'été, plages contiguës, minuit)
- `tests/integration/bookings-module.test.ts`
- `tests/e2e/bookings-admin.spec.ts`
- `tests/e2e/a11y.spec.ts` (pages réservations)
