/**
 * Livraison des webhooks (brique d).
 *
 * - `enqueueEvent(event)` : crée une livraison `pending` par webhook actif abonné.
 * - `attemptDelivery(id)` : verrouille la livraison, signe, envoie, enregistre
 *   le résultat ; en cas d'échec planifie le prochain essai (backoff
 *   exponentiel persistant) ou la passe en `dead` après N essais.
 * - `processDueDeliveries()` : appelé par le cron `/api/cron/webhooks`.
 *
 * Un premier essai est lancé immédiatement après l'événement (en tâche de
 * fond) ; les essais suivants passent par le cron, donc survivent à un
 * redémarrage du serveur.
 */
import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { Duration, Effect, Schedule } from 'effect';
import { schema } from '@database/drizzle';
import { query } from '@/lib/effect/db';
import { AppConfig } from '@/lib/effect/config';
import { NotFoundError, type UpstreamError } from '@/lib/effect/errors';
import type { PolywebEvent } from '@/core/events';
import { decryptSecret, signatureHeader, SIGNATURE_HEADER } from './signing';
import { WebhookHttp } from './http';
import { eventMatches, type WebhookDelivery } from './webhooks';

/** Délai avant l'essai n+1 (n = nombre d'essais déjà faits, ≥ 1). */
export function backoffDelayMs(attempts: number, random = Math.random): number {
  const base = Math.min(30_000 * 2 ** (attempts - 1), 6 * 3_600_000);
  return Math.round(base * (0.9 + random() * 0.2));
}

const AUTO_DISABLE_AFTER = 50;
const LOCK_MS = 60_000;

export interface DeliveryEnvelope {
  id: string;
  event: string;
  occurredAt: string;
  siteId: string | null;
  data: Record<string, unknown>;
}

export const enqueueEvent = (event: PolywebEvent) =>
  Effect.gen(function* () {
    if (!event.siteId) return [] as string[];
    const hooks = yield* query('webhooks.subscribers', (db) =>
      db
        .select({ id: schema.webhooks.id, events: schema.webhooks.events })
        .from(schema.webhooks)
        .where(and(eq(schema.webhooks.siteId, event.siteId!), eq(schema.webhooks.active, true))),
    );
    const targets = hooks.filter((h) => eventMatches(h.events, event.name));
    if (targets.length === 0) return [] as string[];
    const envelope: DeliveryEnvelope = { id: event.id, event: event.name, occurredAt: event.occurredAt, siteId: event.siteId, data: event.payload };
    const rows = yield* query('webhooks.enqueue', (db) =>
      db
        .insert(schema.webhookDeliveries)
        .values(targets.map((h) => ({ webhookId: h.id, eventId: event.id, event: event.name, payload: envelope as unknown as Record<string, unknown> })))
        .returning({ id: schema.webhookDeliveries.id }),
    );
    return rows.map((r) => r.id);
  }).pipe(Effect.withSpan('webhooks.enqueue'));

/** Prend le verrou d'une livraison due ; renvoie undefined si déjà prise/terminée. */
const claim = (deliveryId: string, force: boolean) =>
  query('webhooks.claim', (db) =>
    db
      .update(schema.webhookDeliveries)
      .set({ lockedUntil: new Date(Date.now() + LOCK_MS) })
      .where(
        and(
          eq(schema.webhookDeliveries.id, deliveryId),
          force ? sql`true` : inArray(schema.webhookDeliveries.status, ['pending', 'failed']),
          or(isNull(schema.webhookDeliveries.lockedUntil), lte(schema.webhookDeliveries.lockedUntil, new Date())),
        ),
      )
      .returning(),
  ).pipe(Effect.map((rows) => rows[0]));

export type AttemptOutcome = { deliveryId: string; status: WebhookDelivery['status']; httpStatus: number | null; error: string | null };

export const attemptDelivery = (deliveryId: string, opts: { force?: boolean } = {}) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const http = yield* WebhookHttp;
    const delivery = yield* claim(deliveryId, !!opts.force);
    if (!delivery) return { deliveryId, status: 'pending', httpStatus: null, error: 'locked-or-done' } satisfies AttemptOutcome as AttemptOutcome;
    const [hook] = yield* query('webhooks.forDelivery', (db) =>
      db.select().from(schema.webhooks).where(eq(schema.webhooks.id, delivery.webhookId)).limit(1),
    );
    if (!hook) return yield* new NotFoundError({ entity: 'Webhook', id: delivery.webhookId });

    const body = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = decryptSecret(hook.secretEncrypted, config.signingSecret);
    const headers = {
      'content-type': 'application/json',
      'user-agent': 'Polyweb-Webhooks/1',
      [SIGNATURE_HEADER]: signatureHeader(secret, timestamp, body),
      'Polyweb-Event': delivery.event,
      'Polyweb-Delivery': delivery.id,
      'Polyweb-Timestamp': String(timestamp),
    };

    // Re-essai rapide en mémoire pour les erreurs réseau transitoires
    // (connexion refusée, reset) ; les erreurs HTTP sont gérées par le backoff persistant.
    const result = yield* http.post(hook.url, body, headers).pipe(
      Effect.retry({ times: 2, schedule: Schedule.exponential(Duration.millis(200)) }),
      Effect.map((r) => ({ ok: r.status >= 200 && r.status < 300, ...r, error: null as string | null })),
      Effect.catchTag('UpstreamError', (e: UpstreamError) =>
        Effect.succeed({ ok: false, status: 0, body: '', durationMs: 0, error: String(e.cause ?? e.message).slice(0, 500) }),
      ),
    );

    const attempts = delivery.attempts + 1;
    const gone = result.status === 410;
    const status: WebhookDelivery['status'] = result.ok ? 'success' : gone || attempts >= config.webhooks.maxAttempts ? 'dead' : 'failed';
    const now = new Date();
    yield* query('webhooks.record', (db) =>
      db
        .update(schema.webhookDeliveries)
        .set({
          status,
          attempts,
          lockedUntil: null,
          lastStatusCode: result.status || null,
          lastError: result.error ?? (result.ok ? null : `HTTP ${result.status}`),
          responseSnippet: result.body || null,
          durationMs: result.durationMs,
          deliveredAt: result.ok ? now : null,
          nextAttemptAt: status === 'failed' ? new Date(now.getTime() + backoffDelayMs(attempts)) : null,
        })
        .where(eq(schema.webhookDeliveries.id, delivery.id)),
    );
    const failures = result.ok ? 0 : hook.consecutiveFailures + 1;
    const disable = gone || failures >= AUTO_DISABLE_AFTER;
    yield* query('webhooks.health', (db) =>
      db
        .update(schema.webhooks)
        .set({
          consecutiveFailures: failures,
          ...(disable ? { active: false, disabledReason: gone ? 'HTTP 410 Gone reçu' : `${failures} échecs consécutifs` } : {}),
        })
        .where(eq(schema.webhooks.id, hook.id)),
    );
    if (!result.ok) yield* Effect.logWarning('webhook delivery failed', { deliveryId: delivery.id, status: result.status, error: result.error });
    return { deliveryId: delivery.id, status, httpStatus: result.status || null, error: result.error } satisfies AttemptOutcome as AttemptOutcome;
  }).pipe(Effect.withSpan('webhooks.attempt', { attributes: { deliveryId } }));

export const processDueDeliveries = (limit = 50) =>
  Effect.gen(function* () {
    const due = yield* query('webhooks.due', (db) =>
      db
        .select({ id: schema.webhookDeliveries.id })
        .from(schema.webhookDeliveries)
        .where(
          and(
            inArray(schema.webhookDeliveries.status, ['pending', 'failed']),
            lte(schema.webhookDeliveries.nextAttemptAt, new Date()),
            or(isNull(schema.webhookDeliveries.lockedUntil), lte(schema.webhookDeliveries.lockedUntil, new Date())),
          ),
        )
        .orderBy(schema.webhookDeliveries.nextAttemptAt)
        .limit(limit),
    );
    const outcomes = yield* Effect.forEach(due, (d) => attemptDelivery(d.id), { concurrency: 5 });
    return {
      processed: outcomes.length,
      succeeded: outcomes.filter((o) => o.status === 'success').length,
      failed: outcomes.filter((o) => o.status === 'failed').length,
      dead: outcomes.filter((o) => o.status === 'dead').length,
    };
  });

/** Événement → livraisons → premier essai immédiat (concurrence limitée). */
export const dispatchEvent = (event: PolywebEvent) =>
  Effect.gen(function* () {
    const ids = yield* enqueueEvent(event);
    return yield* Effect.forEach(ids, (id) => attemptDelivery(id), { concurrency: 4 });
  });

/** Relivraison manuelle depuis l'admin (même une livraison `dead`/`success`). */
export const redeliver = (deliveryId: string) =>
  Effect.gen(function* () {
    yield* query('webhooks.reset', (db) =>
      db
        .update(schema.webhookDeliveries)
        .set({ status: 'pending', nextAttemptAt: new Date(), lockedUntil: null })
        .where(eq(schema.webhookDeliveries.id, deliveryId)),
    );
    return yield* attemptDelivery(deliveryId, { force: true });
  });

/** Ping de test : livraison `webhook.ping` vers un seul webhook. */
export const sendPing = (webhookId: string, siteId: string) =>
  Effect.gen(function* () {
    const envelope: DeliveryEnvelope = { id: crypto.randomUUID(), event: 'webhook.ping', occurredAt: new Date().toISOString(), siteId, data: { message: 'Polyweb webhook test' } };
    const [row] = yield* query('webhooks.ping', (db) =>
      db
        .insert(schema.webhookDeliveries)
        .values({ webhookId, eventId: envelope.id, event: envelope.event, payload: envelope as unknown as Record<string, unknown> })
        .returning({ id: schema.webhookDeliveries.id }),
    );
    return yield* attemptDelivery(row!.id);
  });
