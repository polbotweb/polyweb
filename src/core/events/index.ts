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

export type CorePolywebEventName = (typeof POLYWEB_EVENTS)[number];
/** Nom d'événement : cœur ou déclaré par un module via `registerEventNames`. */
export type PolywebEventName = CorePolywebEventName | (string & {});

export interface EventDefinition {
  readonly name: string;
  /** Module déclarant (ex. `sales`). */
  readonly module: string;
  readonly description: string;
}

const NAME = /^[a-z][a-z_]*\.[a-z][a-z_]*$/;
const declared = new Map<string, EventDefinition>(
  POLYWEB_EVENTS.map((name) => [name, { name, module: "core", description: name }]),
);

/** Registre d'événements : chaque module déclare les siens (webhooks, plugins). */
export function registerEventNames(definitions: readonly EventDefinition[]): void {
  for (const d of definitions) {
    if (!NAME.test(d.name)) throw new Error(`Invalid event name: ${d.name}`);
    const existing = declared.get(d.name);
    if (existing && existing.module !== d.module) throw new Error(`Event already registered by ${existing.module}: ${d.name}`);
    declared.set(d.name, d);
  }
}

/** Événements connus (cœur + modules), dans l'ordre de déclaration. */
export function listEventDefinitions(): readonly EventDefinition[] {
  return [...declared.values()];
}

export interface PolywebEvent<T = Record<string, unknown>> {
  readonly id: string;
  readonly name: PolywebEventName;
  readonly occurredAt: string;
  readonly siteId: string | null;
  /**
   * Tenant des modules ERP (`null` = plateforme). Absent pour les événements de site :
   * les webhooks de tous les sites de cette organisation le reçoivent.
   */
  readonly organizationId?: string | null;
  readonly payload: T;
}

export type PolywebEventHandler = (event: PolywebEvent) => void | Promise<void>;

const handlers = new Map<PolywebEventName | "*", Set<PolywebEventHandler>>();

export function isPolywebEventName(value: string): value is PolywebEventName {
  return declared.has(value);
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

/** Exécute un handler isolé ; `false` si il a échoué ou dépassé le timeout (journalisé). */
const runHandler = (name: PolywebEventName, handler: PolywebEventHandler, event: PolywebEvent) =>
  Effect.tryPromise(async () => handler(event)).pipe(
    Effect.timeoutOrElse({ duration: HANDLER_TIMEOUT, orElse: () => Effect.fail(new Error(`handler timeout after 30s`)) }),
    Effect.as(true),
    Effect.catch((error) => Effect.logError(`[events] handler failed for ${name}`, error).pipe(Effect.as(false))),
  );

/** Diffuse un événement déjà construit ; renvoie le nombre d'abonnés en échec (outbox : re-diffusion). */
export const publishEventEffect = (event: PolywebEvent): Effect.Effect<number> =>
  Effect.gen(function* () {
    if (!declared.has(event.name)) yield* Effect.logWarning(`[events] undeclared event ${event.name}`);
    const targets = [...(handlers.get(event.name) ?? []), ...(handlers.get("*") ?? [])];
    const results = yield* Effect.forEach(targets, (handler) => runHandler(event.name, handler, event), { concurrency: "unbounded" });
    return results.filter((ok) => !ok).length;
  }).pipe(Effect.withSpan("events.publish", { attributes: { "event.name": event.name } }));

/**
 * Émet un événement et attend la fin de tous les handlers (parallèles, isolés).
 * Ne échoue jamais : les erreurs et timeouts des abonnés sont journalisés.
 */
export const emitEventEffect = <T extends Record<string, unknown>>(
  name: PolywebEventName,
  payload: T,
  options: { siteId?: string | null; organizationId?: string | null } = {},
): Effect.Effect<PolywebEvent<T>> =>
  Effect.gen(function* () {
    const event: PolywebEvent<T> = {
      id: randomUUID(),
      name,
      occurredAt: new Date().toISOString(),
      siteId: options.siteId ?? null,
      ...(options.organizationId !== undefined ? { organizationId: options.organizationId } : {}),
      payload,
    };
    yield* publishEventEffect(event as PolywebEvent);
    return event;
  }).pipe(Effect.withSpan("events.emit", { attributes: { "event.name": name } }));

/** Adaptateur Promise de `emitEventEffect`. */
export function emitEvent<T extends Record<string, unknown>>(
  name: PolywebEventName,
  payload: T,
  options: { siteId?: string | null; organizationId?: string | null } = {},
): Promise<PolywebEvent<T>> {
  return Effect.runPromise(emitEventEffect(name, payload, options));
}

export function clearEventHandlersForTests(): void {
  handlers.clear();
}
