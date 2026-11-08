/**
 * Abonné du bus (N2-A) : chaque événement diffusé depuis `event_outbox` crée les notifications
 * déclarées pour lui (in-app + mise en file e-mail selon les canaux). Idempotent : clé `${eventId}:${type}:${userId}` (une rediffusion de
 * l'outbox ne duplique rien). Un échec fait échouer le handler → l'outbox rediffuse.
 */
import { Effect } from "effect";
import { onEvent, type PolywebEvent } from "@/core/events";
import { appRuntime } from "@/lib/effect/runtime";
import { definitionsForEvent } from "./registry";
import { notify } from "./service";
import { enqueueEmail } from "./email-outbox";

export const notificationDedupeKey = (eventId: string, type: string, userId: string) => `${eventId}:${type}:${userId}`;

export const handleNotificationEvent = (event: PolywebEvent) =>
  Effect.forEach(
    definitionsForEvent(event.name),
    (definition) =>
      Effect.gen(function* () {
        const recipients = definition.recipients ? yield* definition.recipients(event) : [];
        return yield* Effect.forEach(recipients, (r) =>
          Effect.gen(function* () {
            const dedupeKey = notificationDedupeKey(event.id, definition.type, r.userId);
            if (definition.channels.includes("email") && definition.emailTemplate && r.email) {
              yield* enqueueEmail({
                dedupeKey,
                userId: r.userId,
                organizationId: r.organizationId,
                toEmail: r.email,
                locale: r.locale ?? "fr",
                template: definition.emailTemplate,
                category: definition.category,
                data: { ...r.data, resourceType: r.resourceType ?? null, resourceId: r.resourceId ?? null },
              });
            }
            if (!definition.channels.includes("in_app")) return null;
            return yield* notify({
            userId: r.userId,
            organizationId: r.organizationId,
            module: definition.module,
            type: definition.type,
            category: definition.category,
            actorId: r.actorId ?? null,
            resourceType: r.resourceType ?? null,
            resourceId: r.resourceId ?? null,
            data: r.data,
              dedupeKey,
            });
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
