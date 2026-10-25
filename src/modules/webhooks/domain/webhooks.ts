/** Gestion des webhooks (brique d) — CRUD en Effect. */
import { and, desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { schema } from '@database/drizzle';
import { query } from '@/lib/effect/db';
import { AppConfig } from '@/lib/effect/config';
import { NotFoundError } from '@/lib/effect/errors';
import { decode } from '@/lib/effect/schema';
import { POLYWEB_EVENTS } from '@/core/events';
import { encryptSecret, generateWebhookSecret } from './signing';
import { validateWebhookUrl } from './ssrf';

export type Webhook = typeof schema.webhooks.$inferSelect;
export type PublicWebhook = Omit<Webhook, 'secretEncrypted'>;
export type WebhookDelivery = typeof schema.webhookDeliveries.$inferSelect;

const strip = ({ secretEncrypted: _s, ...rest }: Webhook): PublicWebhook => rest;

/** Motifs acceptés : un nom exact, `<famille>.*` ou `*`. */
export const EVENT_PATTERNS: readonly string[] = [
  '*',
  ...[...new Set(POLYWEB_EVENTS.map((e) => `${e.split('.')[0]}.*`))],
  ...POLYWEB_EVENTS,
];

export function eventMatches(patterns: readonly string[], event: string): boolean {
  return patterns.some((p) => p === '*' || p === event || (p.endsWith('.*') && event.startsWith(p.slice(0, -1))));
}

export const WebhookInput = Schema.Struct({
  name: Schema.Trim.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(120))),
  url: Schema.Trim.pipe(Schema.check(Schema.isMaxLength(2000))),
  events: Schema.Array(Schema.Literals(EVENT_PATTERNS as [string, ...string[]])).pipe(Schema.check(Schema.isMinLength(1))),
  active: Schema.optional(Schema.Boolean),
});

const checkedUrl = (url: string) =>
  AppConfig.use((config) =>
    validateWebhookUrl(url, { allowPrivate: config.webhooks.allowPrivateUrls, requireHttps: config.nodeEnv === 'production' }),
  );

export const createWebhook = (siteId: string, input: unknown, createdBy: string | null) =>
  Effect.gen(function* () {
    const data = yield* decode(WebhookInput)(input);
    const url = yield* checkedUrl(data.url);
    const config = yield* AppConfig;
    const secret = generateWebhookSecret();
    const [row] = yield* query('webhooks.create', (db) =>
      db
        .insert(schema.webhooks)
        .values({
          siteId,
          name: data.name,
          url: url.toString(),
          events: [...new Set(data.events)],
          active: data.active ?? true,
          secretEncrypted: encryptSecret(secret, config.signingSecret),
          createdBy,
        })
        .returning(),
    );
    return { secret, webhook: strip(row!) };
  });

export const updateWebhook = (siteId: string, id: string, input: unknown) =>
  Effect.gen(function* () {
    const data = yield* decode(WebhookInput)(input);
    const url = yield* checkedUrl(data.url);
    const rows = yield* query('webhooks.update', (db) =>
      db
        .update(schema.webhooks)
        .set({
          name: data.name,
          url: url.toString(),
          events: [...new Set(data.events)],
          active: data.active ?? true,
          // Réactivation manuelle → on remet le compteur à zéro.
          ...(data.active ? { consecutiveFailures: 0, disabledReason: null } : {}),
        })
        .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.siteId, siteId)))
        .returning(),
    );
    if (!rows[0]) return yield* new NotFoundError({ entity: 'Webhook', id });
    return strip(rows[0]);
  });

export const rotateSecret = (siteId: string, id: string) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const secret = generateWebhookSecret();
    const rows = yield* query('webhooks.rotate', (db) =>
      db
        .update(schema.webhooks)
        .set({ secretEncrypted: encryptSecret(secret, config.signingSecret) })
        .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.siteId, siteId)))
        .returning({ id: schema.webhooks.id }),
    );
    if (!rows[0]) return yield* new NotFoundError({ entity: 'Webhook', id });
    return secret;
  });

export const deleteWebhook = (siteId: string, id: string) =>
  Effect.gen(function* () {
    const rows = yield* query('webhooks.delete', (db) =>
      db.delete(schema.webhooks).where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.siteId, siteId))).returning({ id: schema.webhooks.id }),
    );
    if (!rows[0]) return yield* new NotFoundError({ entity: 'Webhook', id });
  });

export const listWebhooks = (siteId: string) =>
  query('webhooks.list', (db) =>
    db.select().from(schema.webhooks).where(eq(schema.webhooks.siteId, siteId)).orderBy(desc(schema.webhooks.createdAt)),
  ).pipe(Effect.map((rows) => rows.map(strip)));

export const getWebhook = (siteId: string, id: string) =>
  Effect.flatMap(
    query('webhooks.get', (db) =>
      db.select().from(schema.webhooks).where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.siteId, siteId))).limit(1),
    ),
    ([row]) => (row ? Effect.succeed(strip(row)) : Effect.fail(new NotFoundError({ entity: 'Webhook', id }))),
  );

export const listDeliveries = (webhookId: string, limit = 30) =>
  query('webhooks.deliveries', (db) =>
    db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.webhookId, webhookId))
      .orderBy(desc(schema.webhookDeliveries.createdAt))
      .limit(limit),
  );
