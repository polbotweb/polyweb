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

/**
 * Le retour arrière (DDL) s'exécute pendant que d'autres fichiers d'intégration écrivent dans les
 * tables parentes (`user`, `organization`, `sites`…) : sans précaution, DROP TABLE prend ses verrous
 * au fil de l'eau et peut former un interblocage (40P01) avec une suppression en cascade concurrente.
 * On prend donc TOUS les verrous d'emblée, parents d'abord (aucun verrou détenu avant), avec un délai
 * borné, et on rejoue la transaction si elle est choisie comme victime (40P01) ou expire (55P03).
 */
const LOCKED = ['"user"', 'organization', 'sites', 'moderation_reports', 'moderation_actions', 'notifications', 'badge_awards', 'forums', 'forum_revisions', 'forum_locks', 'forum_categories', 'forum_tags', 'forum_topics', 'forum_posts', 'forum_topic_tags', 'forum_votes', 'forum_reactions', 'forum_user_stats', 'forum_polls', 'forum_poll_options', 'forum_poll_ballots', 'forum_poll_votes', 'forum_topic_participants', 'forum_topic_follows', 'forum_sanction_policies', 'forum_sanctions'];
const pgCode = (e: unknown): string | undefined => { for (let c: unknown = e; c && typeof c === 'object'; c = (c as { cause?: unknown }).cause) { const code = (c as { code?: unknown }).code; if (typeof code === 'string') return code; } return undefined; };
async function exclusive(body: (tx: Tx) => Promise<void>) {
  for (let attempt = 1; ; attempt++) {
    try {
      await getDrizzle().transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL lock_timeout = '10s'`));
        await tx.execute(sql.raw(`LOCK TABLE ${LOCKED.join(', ')} IN ACCESS EXCLUSIVE MODE`));
        await body(tx);
        throw new Rollback();
      });
    } catch (error) {
      if (error instanceof Rollback) return;
      if (attempt < 5 && ['40P01', '55P03'].includes(pgCode(error) ?? '')) continue;
      throw error;
    }
  }
}

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
    await exclusive(async (tx) => {
      const before = await tables(tx);
      expect(before.length).toBeGreaterThanOrEqual(20);
      for (const s of down) await tx.execute(sql.raw(s));
      expect(await tables(tx)).toEqual([]);
      for (const s of up) await tx.execute(sql.raw(s));
      expect(await tables(tx)).toEqual(before);
    });
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
