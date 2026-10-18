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
 */
import { randomUUID } from "node:crypto";

export const POLYWEB_EVENTS = [
  "content.created",
  "content.updated",
  "content.published",
  "content.unpublished",
  "content.deleted",
  "form.submitted",
  "payment.succeeded",
  "payment.failed",
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

/**
 * Émet un événement et attend la fin de tous les handlers.
 * Ne lève jamais : les erreurs des abonnés sont journalisées.
 */
export async function emitEvent<T extends Record<string, unknown>>(
  name: PolywebEventName,
  payload: T,
  options: { siteId?: string | null } = {},
): Promise<PolywebEvent<T>> {
  const event: PolywebEvent<T> = {
    id: randomUUID(),
    name,
    occurredAt: new Date().toISOString(),
    siteId: options.siteId ?? null,
    payload,
  };
  const targets = [...(handlers.get(name) ?? []), ...(handlers.get("*") ?? [])];
  const results = await Promise.allSettled(targets.map((handler) => handler(event as PolywebEvent)));
  for (const result of results) {
    if (result.status === "rejected") console.error(`[events] handler failed for ${name}:`, result.reason);
  }
  return event;
}

export function clearEventHandlersForTests(): void {
  handlers.clear();
}
