/**
 * Abonné du bus (N2-A) : chaque événement diffusé depuis `event_outbox` crée les notifications
 * déclarées pour lui. Idempotent : clé `${eventId}:${type}:${userId}` (une rediffusion de
 * l'outbox ne duplique rien). Un échec fait échouer le handler → l'outbox rediffuse.
 */
import { Effect } from "effect";
import { onEvent, type PolywebEvent } from "@/core/events";
import { appRuntime } from "@/lib/effect/runtime";
import { definitionsForEvent } from "./registry";
import { notify } from "./service";

export const notificationDedupeKey = (eventId: string, type: string, userId: string) => `${eventId}:${type}:${userId}`;

export const handleNotificationEvent = (event: PolywebEvent) =>
  Effect.forEach(
    definitionsForEvent(event.name),
    (definition) =>
      Effect.gen(function* () {
        const recipients = definition.recipients ? yield* definition.recipients(event) : [];
        return yield* Effect.forEach(recipients, (r) =>
          notify({
            userId: r.userId,
            organizationId: r.organizationId,
            module: definition.module,
            type: definition.type,
            category: definition.category,
            actorId: r.actorId ?? null,
            resourceType: r.resourceType ?? null,
            resourceId: r.resourceId ?? null,
            data: r.data,
            dedupeKey: notificationDedupeKey(event.id, definition.type, r.userId),
          }),
        );
      }),
    { concurrency: 1 },
  ).pipe(Effect.map((created) => created.flat().filter((id) => id !== null).length));

let registered = false;

export function registerNotificationSubscriber(): void {
  if (registered) return;
  registered = true;
  onEvent("*", async (event) => {
    if (definitionsForEvent(event.name).length === 0) return;
    await appRuntime.runPromise(handleNotificationEvent(event));
  });
}
