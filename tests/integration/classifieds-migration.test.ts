/**
 * Migration 0056 (classifieds + core/attributes) : retour arrière puis ré-application
 * dans une transaction annulée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { getDrizzle } from '@/database/drizzle';
import { splitSqlStatements } from '@database/commands/_migration-sql';

const dir = resolve(process.cwd(), 'src/database/migrations');
const up = splitSqlStatements(readFileSync(resolve(dir, '0056_classifieds_core.sql'), 'utf8'));
const down = splitSqlStatements(readFileSync(resolve(dir, 'down/0056_classifieds_core.down.sql'), 'utf8'));
const journal = JSON.parse(readFileSync(resolve(dir, 'meta/_journal.json'), 'utf8')) as { entries: { idx: number; tag: string; when: number }[] };

class Rollback extends Error {}
type Tx = Parameters<Parameters<ReturnType<typeof getDrizzle>['transaction']>[0]>[0];
const rows = async (tx: Tx, query: ReturnType<typeof sql>) => (await tx.execute(query)).rows as Record<string, unknown>[];
const tables = (tx: Tx) => rows(tx, sql`select table_name from information_schema.tables where table_schema = 'public' and (table_name like 'classified%' or table_name like 'attribute_%') order by 1`);

/**
 * Le retour arrière (DDL) s'exécute pendant que d'autres fichiers d'intégration écrivent dans les
 * tables parentes (`user`, `organization`, `sites`…) : sans précaution, DROP TABLE prend ses verrous
 * au fil de l'eau et peut former un interblocage (40P01) avec une écriture concurrente.
 * On prend donc TOUS les verrous d'emblée, parents d'abord (aucun verrou détenu avant), avec un délai
 * borné, et on rejoue la transaction si elle est choisie comme victime (40P01) ou expire (55P03).
 */
const LOCKED = [
  '"user"', 'organization', 'sites', 'media_files', 'messaging_conversations',
  'moderation_reports', 'moderation_actions', 'notifications',
  'classified_inquiries', 'classified_saved_search_filters', 'classified_saved_searches',
  'classified_favorites', 'classified_ad_media', 'classified_ads',
  'classified_category_translations', 'classified_categories', 'classified_site_settings',
  'attribute_value_options', 'attribute_values', 'attribute_option_translations',
  'attribute_options', 'attribute_definition_translations', 'attribute_definitions',
];
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

describe('migration 0056 classifieds', () => {
  it('journal : 0056 après 0055 (ordre du migrateur)', () => {
    const e55 = journal.entries.find((e) => e.idx === 55)!;
    const e56 = journal.entries.find((e) => e.idx === 56)!;
    expect(e56.tag).toBe('0056_classifieds_core');
    expect(e56.when).toBeGreaterThan(e55.when);
  });

  it('down puis up : tables recréées à l’identique', async () => {
    await exclusive(async (tx) => {
      const before = await tables(tx);
      expect(before.length).toBeGreaterThanOrEqual(14);
      for (const s of down) await tx.execute(sql.raw(s));
      expect(await tables(tx)).toEqual([]);
      for (const s of up) await tx.execute(sql.raw(s));
      expect(await tables(tx)).toEqual(before);
    });
  });
});
