# Messagerie privée

Conversations **1:1**. Pas de groupes, pas de chiffrement applicatif ni promesse E2E. Le corps des messages n'entre jamais dans l'audit, l'outbox ni les journaux.

## Préférence destinataire

`messaging_preferences.who_can_message` : `shared_org` (défaut), `everyone`, `nobody`.
Cible absente / bloquée / hors portée / refusée → `NOT_FOUND` identique. Blocs et débit toujours appliqués.

## Tables (`0054_messaging_core`)

préférences, blocs, conversations (paire ordonnée), états (tombstone par participant), messages (`visible`/`hidden`).

## Modération

Adaptateur `messaging.message` : extrait = uniquement le message signalé. Signalement réservé aux participants.

## Notifications

Catégorie `messaging`, `MESSAGE_RECEIVED` sur `messaging.message_created` (sans corps).

## UI

`/{lang}/messages`, `/{lang}/messages/{id}`.

Hors périmètre : groupes, PJ, E2E, typing, unsends globaux, purge.
