/**
 * Bus d'événements de contenu Polyweb.
 *
 * Point unique par lequel les modules annoncent un changement d'état
 * (publication, suppression, soumission de formulaire, paiement…). Les
 * consommateurs (webhooks sortants, index de recherche, plugins) s'abonnent
 * ici au lieu d'être appelés en dur par chaque module.
 *
 * Les handlers sont exécutés en parallèle, isolés les uns des autres : une
 * erreur d'un abonné est journalisée mais n'empêche jamais la mutation
 * d'aboutir ni les autres abonnés de tourner.
 *
 * Implémentation Effect : `emitEventEffect` exécute les handlers en parallèle,
 * chacun borné par un timeout (`HANDLER_TIMEOUT`) ; `emitEvent` est l'adaptateur Promise.
 */
import { randomUUID } from "node:crypto";
import { Duration, Effect } from "effect";

export const POLYWEB_EVENTS = [
  "content.created",
  "content.updated",
  "content.published",
  "content.unpublished",
  "content.deleted",
  "form.submitted",
  "payment.succeeded",
  "payment.failed",
  "payment.refunded",
  "media.uploaded",
  "media.deleted",
] as const;

export type PolywebEventName = (typeof POLYWEB_EVENTS)[number];

export interface PolywebEvent<T = Record<string, unknown>> {
  readonly id: string;
  readonly name: PolywebEventName;
  readonly occurredAt: string;
  readonly siteId: string | null;
  readonly payload: T;
}

export type PolywebEventHandler = (event: PolywebEvent) => void | Promise<void>;

const handlers = new Map<PolywebEventName | "*", Set<PolywebEventHandler>>();

export function isPolywebEventName(value: string): value is PolywebEventName {
  return (POLYWEB_EVENTS as readonly string[]).includes(value);
}

/** Abonne un handler à un événement (ou `*` pour tous). Retourne la fonction de désabonnement. */
export function onEvent(name: PolywebEventName | "*", handler: PolywebEventHandler): () => void {
  let set = handlers.get(name);
  if (!set) {
    set = new Set();
    handlers.set(name, set);
  }
  set.add(handler);
  return () => set.delete(handler);
}

const HANDLER_TIMEOUT = Duration.seconds(30);

const runHandler = (name: PolywebEventName, handler: PolywebEventHandler, event: PolywebEvent) =>
  Effect.tryPromise(async () => handler(event)).pipe(
    Effect.timeoutOrElse({ duration: HANDLER_TIMEOUT, orElse: () => Effect.fail(new Error(`handler timeout after 30s`)) }),
    Effect.catch((error) => Effect.logError(`[events] handler failed for ${name}`, error)),
  );

/**
 * Émet un événement et attend la fin de tous les handlers (parallèles, isolés).
 * Ne échoue jamais : les erreurs et timeouts des abonnés sont journalisés.
 */
export const emitEventEffect = <T extends Record<string, unknown>>(
  name: PolywebEventName,
  payload: T,
  options: { siteId?: string | null } = {},
): Effect.Effect<PolywebEvent<T>> =>
  Effect.gen(function* () {
    const event: PolywebEvent<T> = {
      id: randomUUID(),
      name,
      occurredAt: new Date().toISOString(),
      siteId: options.siteId ?? null,
      payload,
    };
    const targets = [...(handlers.get(name) ?? []), ...(handlers.get("*") ?? [])];
    yield* Effect.forEach(targets, (handler) => runHandler(name, handler, event as PolywebEvent), { concurrency: "unbounded", discard: true });
    return event;
  }).pipe(Effect.withSpan("events.emit", { attributes: { "event.name": name } }));

/** Adaptateur Promise de `emitEventEffect`. */
export function emitEvent<T extends Record<string, unknown>>(
  name: PolywebEventName,
  payload: T,
  options: { siteId?: string | null } = {},
): Promise<PolywebEvent<T>> {
  return Effect.runPromise(emitEventEffect(name, payload, options));
}

export function clearEventHandlersForTests(): void {
  handlers.clear();
}
