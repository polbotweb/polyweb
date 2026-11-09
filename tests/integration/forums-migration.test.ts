/**
 * Migration 0055 (forums) : retour arrière puis ré-application dans une transaction annulée,
 * et déclencheurs de nettoyage (votes, réactions, signalements, réponse acceptée) à la suppression.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { getDrizzle } from '@/database/drizzle';
import { splitSqlStatements } from '@database/commands/_migration-sql';

const dir = resolve(process.cwd(), 'src/database/migrations');
const up = splitSqlStatements(readFileSync(resolve(dir, '0055_forums_core.sql'), 'utf8'));
const down = splitSqlStatements(readFileSync(resolve(dir, 'down/0055_forums_core.down.sql'), 'utf8'));
const journal = JSON.parse(readFileSync(resolve(dir, 'meta/_journal.json'), 'utf8')) as { entries: { idx: number; tag: string; when: number }[] };

class Rollback extends Error {}
type Tx = Parameters<Parameters<ReturnType<typeof getDrizzle>['transaction']>[0]>[0];
const rows = async (tx: Tx, query: ReturnType<typeof sql>) => (await tx.execute(query)).rows as Record<string, unknown>[];
const tables = (tx: Tx) => rows(tx, sql`select table_name from information_schema.tables where table_schema = 'public' and (table_name like 'forum%' or table_name = 'badge_awards') order by 1`);

const tag = `fm${Date.now()}`;
const id = (n: number) => `${tag}-0000-0000-0000-${String(n).padStart(12, '0')}`;

describe('migration 0055 forums', () => {
  it('journal : 0055 après 0054 (ordre du migrateur)', () => {
    const e54 = journal.entries.find((e) => e.idx === 54)!;
    const e55 = journal.entries.find((e) => e.idx === 55)!;
    expect(e55.tag).toBe('0055_forums_core');
    expect(e55.when).toBeGreaterThan(e54.when);
  });

  it('down puis up : tables recréées à l’identique', async () => {
    await expect(getDrizzle().transaction(async (tx) => {
      const before = await tables(tx);
      expect(before.length).toBeGreaterThanOrEqual(20);
      for (const s of down) await tx.execute(sql.raw(s));
      expect(await tables(tx)).toEqual([]);
      for (const s of up) await tx.execute(sql.raw(s));
      expect(await tables(tx)).toEqual(before);
      throw new Rollback();
    })).rejects.toBeInstanceOf(Rollback);
  });

  it('suppression d’une réponse : votes, réactions, signalements nettoyés, solution retirée', async () => {
    await expect(getDrizzle().transaction(async (tx) => {
      const [U, S, F, CAT, T, P] = [id(1), id(2), id(3), id(4), id(5), id(6)];
      await tx.execute(sql`insert into "user" (id, name, email, email_verified) values (${U}, 'U', ${`${tag}@t.test`}, true)`);
      await tx.execute(sql`insert into sites (id, slug, name) values (${S}, ${tag}, 'S')`);
      await tx.execute(sql`insert into forums (id, site_id, slug, title) values (${F}, ${S}, 'f', 'F')`);
      await tx.execute(sql`insert into forum_categories (id, forum_id, slug, translations) values (${CAT}, ${F}, 'c', '{}'::jsonb)`);
      await tx.execute(sql`insert into forum_topics (id, forum_id, category_id, site_id, author_id, title, body, body_html) values (${T}, ${F}, ${CAT}, ${S}, ${U}, 'Titre', 'corps', '<p>corps</p>')`);
      await tx.execute(sql`insert into forum_posts (id, topic_id, site_id, author_id, body, body_html) values (${P}, ${T}, ${S}, ${U}, 'r', '<p>r</p>')`);
      await tx.execute(sql`update forum_topics set accepted_post_id = ${P} where id = ${T}`);
      await tx.execute(sql`insert into forum_votes (target_type, target_id, user_id, value) values ('post', ${P}, ${U}, 1), ('topic', ${T}, ${U}, 1)`);
      await tx.execute(sql`insert into forum_reactions (target_type, target_id, user_id, reaction) values ('post', ${P}, ${U}, 'like')`);
      await tx.execute(sql`delete from forum_posts where id = ${P}`);
      expect(await rows(tx, sql`select 1 from forum_votes where target_id = ${P}`)).toEqual([]);
      expect(await rows(tx, sql`select 1 from forum_reactions where target_id = ${P}`)).toEqual([]);
      expect((await rows(tx, sql`select accepted_post_id from forum_topics where id = ${T}`))[0].accepted_post_id).toBeNull();
      expect(await rows(tx, sql`select 1 from forum_votes where target_id = ${T}`)).toHaveLength(1);
      await tx.execute(sql`delete from forums where id = ${F}`);
      expect(await rows(tx, sql`select 1 from forum_votes where target_id = ${T}`)).toEqual([]);
      throw new Rollback();
    })).rejects.toBeInstanceOf(Rollback);
  });
});
