/**
 * Abonne le dispatcher de webhooks au bus d'événements.
 * L'enregistrement des livraisons est attendu (durable) ; l'envoi HTTP part
 * en tâche de fond sur le runtime partagé pour ne pas ralentir la mutation.
 */
import { Effect } from 'effect';
import { onEvent } from '@/core/events';
import { appRuntime } from '@/lib/effect/runtime';
import { attemptDelivery, enqueueEvent } from './domain/dispatcher';

let registered = false;

export function registerWebhookDispatcher(): void {
  if (registered) return;
  registered = true;
  onEvent('*', async (event) => {
    const ids = await appRuntime.runPromise(enqueueEvent(event));
    if (ids.length === 0) return;
    appRuntime.runFork(
      Effect.forEach(ids, (id) => attemptDelivery(id), { concurrency: 4 }).pipe(
        Effect.catchCause((cause) => Effect.logError('webhook dispatch failed', cause)),
      ),
    );
  });
}
