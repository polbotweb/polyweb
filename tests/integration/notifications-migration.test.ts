/**
 * Migration 0052 (N1-A) : reprise sans perte de blog_notifications / service_notifications dans
 * la table partagée `notifications`, réversible. Tout s'exécute dans une transaction annulée :
 * down → lignes anciennes → up → vérification → down → mêmes lignes qu'au départ.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { getDrizzle } from '@/database/drizzle';
import { splitSqlStatements } from '@database/commands/_migration-sql';

const dir = resolve(process.cwd(), 'src/database/migrations');
const up = splitSqlStatements(readFileSync(resolve(dir, '0052_notifications_core.sql'), 'utf8'));
const down = splitSqlStatements(readFileSync(resolve(dir, 'down/0052_notifications_core.down.sql'), 'utf8'));

class Rollback extends Error {}
type Tx = Parameters<Parameters<ReturnType<typeof getDrizzle>['transaction']>[0]>[0];
const run = async (tx: Tx, statements: string[]) => { for (const s of statements) await tx.execute(sql.raw(s)); };
const rows = async (tx: Tx, query: string) => (await tx.execute(sql.raw(query))).rows as Record<string, unknown>[];

const tag = `nm${Date.now()}`;
const id = (n: number) => `${tag}-0000-0000-0000-${String(n).padStart(12, '0')}`;
const U1 = id(1), U2 = id(2), POST = id(3), COMMENT = id(4), SERVICE = id(5), REVIEW = id(6);
const B1 = id(10), B2 = id(11), S1 = id(20), S2 = id(21);

async function seedLegacy(tx: Tx) {
  await tx.execute(sql`insert into "user" (id, name, email, email_verified) values (${U1}, 'A', ${`${tag}a@example.test`}, true), (${U2}, 'B', ${`${tag}b@example.test`}, true)`);
  await tx.execute(sql`insert into blog_posts (id, author_id, slug) values (${POST}, ${U1}, ${`${tag}-post`})`);
  await tx.execute(sql`insert into blog_comments (id, post_id, content) values (${COMMENT}, ${POST}, 'c')`);
  await tx.execute(sql`insert into services (id, provider_id, slug) values (${SERVICE}, ${U1}, ${`${tag}-svc`})`);
  await tx.execute(sql`insert into service_reviews (id, service_id, content, rating) values (${REVIEW}, ${SERVICE}, 'r', 5)`);
  await tx.execute(sql`insert into blog_notifications (id, user_id, type, post_id, comment_id, from_user_id, is_read, metadata, created_at)
    values (${B1}, ${U1}, 'NEW_COMMENT', ${POST}, ${COMMENT}, ${U2}, true, '{"content":"x"}', '2026-01-02 03:04:05.678'),
           (${B2}, ${U1}, 'POST_PUBLISHED', ${POST}, null, null, false, null, '2026-01-03 00:00:00')`);
  await tx.execute(sql`insert into service_notifications (id, recipient_id, actor_id, service_id, review_id, type, title, message, read_at, created_at)
    values (${S1}, ${U1}, ${U2}, ${SERVICE}, ${REVIEW}, 'NEW_REVIEW', 'T', 'M', '2026-01-05 00:00:00', '2026-01-04 00:00:00'),
           (${S2}, ${U1}, null, ${SERVICE}, null, 'SERVICE_PUBLISHED', 'T2', 'M2', null, '2026-01-06 00:00:00')`);
}

const legacySnapshot = async (tx: Tx) => ({
  blog: await rows(tx, `select * from blog_notifications where id like '${tag}%' order by id`),
  services: await rows(tx, `select * from service_notifications where id like '${tag}%' order by id`),
});

async function inRollback(fn: (tx: Tx) => Promise<void>) {
  await expect(getDrizzle().transaction(async (tx) => { await fn(tx); throw new Rollback(); })).rejects.toBeInstanceOf(Rollback);
}

describe('migration 0052 notifications (N1-A)', () => {
  it('reprend les lignes sans perte puis revient exactement à l’état initial', async () => {
    await inRollback(async (tx) => {
      await run(tx, down);
      await seedLegacy(tx);
      const before = await legacySnapshot(tx);
      expect(before.blog).toHaveLength(2);
      expect(before.services).toHaveLength(2);

      await run(tx, up);
      const migrated = await rows(tx, `select * from notifications where id like '${tag}%' order by id`);
      expect(migrated).toHaveLength(4);
      const byId = new Map(migrated.map((r) => [r.id, r]));
      expect(byId.get(B1)).toMatchObject({ module: 'blog', type: 'NEW_COMMENT', category: 'comments', resource_type: 'post', resource_id: POST, actor_id: U2, data: { commentId: COMMENT, metadata: { content: 'x' } } });
      expect(String(byId.get(B1)!.read_at)).toBe(String(byId.get(B1)!.created_at));
      expect(byId.get(B2)).toMatchObject({ category: 'publishing', data: {}, read_at: null });
      expect(byId.get(S1)).toMatchObject({ module: 'services', category: 'reviews', resource_type: 'service', resource_id: SERVICE, data: { reviewId: REVIEW }, title: 'T', message: 'M' });
      expect(await rows(tx, `select to_regclass('blog_notifications') as t`)).toEqual([{ t: null }]);

      await run(tx, down);
      expect(await legacySnapshot(tx)).toEqual(before);
    });
  });

  it('les déclencheurs reproduisent la suppression en cascade avec la ressource', async () => {
    await inRollback(async (tx) => {
      await run(tx, down);
      await seedLegacy(tx);
      await run(tx, up);
      await tx.execute(sql`delete from blog_comments where id = ${COMMENT}`);
      expect((await rows(tx, `select id from notifications where id like '${tag}%' order by id`)).map((r) => r.id)).toEqual([B2, S1, S2]);
      await tx.execute(sql`delete from service_reviews where id = ${REVIEW}`);
      await tx.execute(sql`delete from blog_posts where id = ${POST}`);
      expect((await rows(tx, `select id from notifications where id like '${tag}%'`)).map((r) => r.id)).toEqual([S2]);
      await tx.execute(sql`delete from services where id = ${SERVICE}`);
      expect(await rows(tx, `select id from notifications where id like '${tag}%'`)).toEqual([]);
    });
  });
});
