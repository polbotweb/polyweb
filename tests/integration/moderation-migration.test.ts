/**
 * Migration 0053 (modération générique) : reprise sans perte de blog_reports, service_reports et
 * blog_comment_moderations, retour arrière exact sur les données historiques, préservation (archives)
 * des données génériques que les anciens schémas ne savent pas exprimer, refus explicite d'un second
 * retour arrière tant que les archives existent. Tout s'exécute dans une transaction annulée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { getDrizzle } from '@/database/drizzle';
import { splitSqlStatements } from '@database/commands/_migration-sql';

const dir = resolve(process.cwd(), 'src/database/migrations');
const up = splitSqlStatements(readFileSync(resolve(dir, '0053_moderation_core.sql'), 'utf8'));
const down = splitSqlStatements(readFileSync(resolve(dir, 'down/0053_moderation_core.down.sql'), 'utf8'));

class Rollback extends Error {}
type Tx = Parameters<Parameters<ReturnType<typeof getDrizzle>['transaction']>[0]>[0];
const run = async (tx: Tx, statements: string[]) => { for (const s of statements) await tx.execute(sql.raw(s)); };
const rows = async (tx: Tx, query: string) => (await tx.execute(sql.raw(query))).rows as Record<string, unknown>[];

const tag = `mm${Date.now()}`;
const id = (n: number) => `${tag}-0000-0000-0000-${String(n).padStart(12, '0')}`;
const MOD = id(1), REP = id(2), GONE = id(3), ORG = id(4);
const POST = id(10), ORG_POST = id(11), COMMENT = id(12), ORG_COMMENT = id(13), REVIEW = id(14);
const SERVICE = id(20), SCOMMENT = id(21), SREVIEW = id(22);

/** Début de test : état « avant 0053 » (down depuis la base migrée, archives des données de démo écartées). */
async function toLegacy(tx: Tx) {
  await run(tx, down);
  await tx.execute(sql.raw('DROP TABLE "moderation_reports_0053_archive"'));
  await tx.execute(sql.raw('DROP TABLE "moderation_actions_0053_archive"'));
}

async function seedLegacy(tx: Tx) {
  await tx.execute(sql`insert into "user" (id, name, email, email_verified) values (${MOD}, 'Mod', ${`${tag}m@example.test`}, true), (${REP}, 'Rep', ${`${tag}r@example.test`}, true), (${GONE}, 'Gone', ${`${tag}g@example.test`}, true)`);
  await tx.execute(sql`insert into organization (id, name, slug, created_at) values (${ORG}, 'Org', ${`${tag}-org`}, now())`);
  await tx.execute(sql`insert into blog_posts (id, author_id, slug) values (${POST}, ${MOD}, ${`${tag}-p`})`);
  await tx.execute(sql`insert into blog_posts (id, author_id, slug, organization_id) values (${ORG_POST}, ${MOD}, ${`${tag}-op`}, ${ORG})`);
  await tx.execute(sql`insert into blog_comments (id, post_id, content, status) values (${COMMENT}, ${POST}, 'c', 'APPROVED'), (${ORG_COMMENT}, ${ORG_POST}, 'oc', 'APPROVED')`);
  await tx.execute(sql`insert into blog_post_reviews (id, post_id, content, rating) values (${REVIEW}, ${POST}, 'r', 4)`);
  await tx.execute(sql`insert into services (id, provider_id, slug, organization_id) values (${SERVICE}, ${MOD}, ${`${tag}-s`}, ${ORG})`);
  await tx.execute(sql`insert into service_comments (id, service_id, content) values (${SCOMMENT}, ${SERVICE}, 'sc')`);
  await tx.execute(sql`insert into service_reviews (id, service_id, content, rating) values (${SREVIEW}, ${SERVICE}, 'sr', 2)`);
  // Signalements blog : tous les statuts (dont REVIEWED et un statut inconnu), motif inconnu,
  // doublons ouverts du même signaleur, signaleur et résolveur supprimés (références orphelines → NULL).
  await tx.execute(sql`insert into blog_reports (id, post_id, comment_id, review_id, reporter_id, reason, description, status, resolved_by, resolved_at, created_at) values
    (${id(100)}, ${POST}, null, null, ${REP}, 'SPAM', 'd1 <script>x</script>', 'PENDING', null, null, '2026-01-01 10:00:00.123'),
    (${id(101)}, null, ${COMMENT}, null, ${REP}, 'ABUSIVE', null, 'REVIEWED', ${MOD}, '2026-01-02 10:00:00', '2026-01-01 11:00:00'),
    (${id(102)}, null, null, ${REVIEW}, ${REP}, 'OFF_TOPIC', null, 'RESOLVED', ${MOD}, '2026-01-03 10:00:00', '2026-01-01 12:00:00'),
    (${id(103)}, null, ${COMMENT}, null, null, 'HATE_SPEECH', null, 'REJECTED', ${GONE}, '2026-01-04 10:00:00', '2026-01-01 13:00:00'),
    (${id(104)}, null, ${COMMENT}, null, ${REP}, 'SPAM', 'dup', 'PENDING', null, null, '2026-01-05 10:00:00'),
    (${id(105)}, null, ${COMMENT}, null, ${REP}, 'SPAM', 'dup', 'PENDING', null, null, '2026-01-05 10:00:01'),
    (${id(106)}, null, ${ORG_COMMENT}, null, ${GONE}, 'WEIRD', null, 'ESCALATED', null, null, '2026-01-06 10:00:00')`);
  // Signalements services : motifs libres/inconnus, minuscules, doublons, cible service directe.
  await tx.execute(sql`insert into service_reports (id, service_id, comment_id, review_id, reporter_id, reason, description, status, resolved_by, resolved_at, created_at) values
    (${id(200)}, ${SERVICE}, null, null, ${REP}, 'Contenu trompeur', 'x', 'PENDING', null, null, '2026-02-01 10:00:00'),
    (${id(201)}, ${SERVICE}, null, null, ${REP}, 'Contenu trompeur', 'x', 'PENDING', null, null, '2026-02-01 10:00:05'),
    (${id(202)}, null, ${SCOMMENT}, null, ${REP}, 'SPAM', null, 'RESOLVED', ${MOD}, '2026-02-02 10:00:00', '2026-02-01 11:00:00'),
    (${id(203)}, null, null, ${SREVIEW}, null, 'off_topic', null, 'REVIEWED', null, null, '2026-02-01 12:00:00')`);
  // Historique : toutes les actions, dont EDIT avec l'ancien contenu.
  await tx.execute(sql`insert into blog_comment_moderations (id, comment_id, moderator_id, action, reason, previous_values, created_at) values
    (${id(300)}, ${COMMENT}, ${MOD}, 'APPROVE', 'ok', '{"status":"PENDING","content":"c"}', '2026-03-01 10:00:00'),
    (${id(301)}, ${COMMENT}, ${MOD}, 'EDIT', 'typo', '{"status":"APPROVED","content":"old <b>x</b>"}', '2026-03-02 10:00:00'),
    (${id(302)}, ${COMMENT}, ${MOD}, 'DELETE', null, '{"status":"APPROVED","content":"c"}', '2026-03-03 10:00:00'),
    (${id(303)}, ${COMMENT}, ${MOD}, 'RESTORE', null, '{"status":"TRASH","content":"c"}', '2026-03-04 10:00:00'),
    (${id(304)}, ${ORG_COMMENT}, ${MOD}, 'REJECT', null, null, '2026-03-05 10:00:00')`);
  // Références orphelines : signaleur/résolveur supprimés (ON DELETE SET NULL des anciennes tables).
  await tx.execute(sql`delete from "user" where id = ${GONE}`);
}

const legacySnapshot = async (tx: Tx) => ({
  blog: await rows(tx, `select * from blog_reports where id like '${tag}%' order by id`),
  services: await rows(tx, `select * from service_reports where id like '${tag}%' order by id`),
  history: await rows(tx, `select * from blog_comment_moderations where id like '${tag}%' order by id`),
});

async function inRollback(fn: (tx: Tx) => Promise<void>) {
  await expect(getDrizzle().transaction(async (tx) => { await fn(tx); throw new Rollback(); })).rejects.toBeInstanceOf(Rollback);
}

describe('migration 0053 modération générique', () => {
  it('reprend toutes les lignes (identifiants, valeurs d’origine, horodatages) puis revient exactement à l’état initial', async () => {
    await inRollback(async (tx) => {
      await toLegacy(tx);
      await seedLegacy(tx);
      const before = await legacySnapshot(tx);
      expect(before.blog).toHaveLength(7);
      expect(before.services).toHaveLength(4);
      expect(before.history).toHaveLength(5);
      expect(before.blog.find((r) => r.id === id(106))).toMatchObject({ reporter_id: null });

      await run(tx, up);
      const reports = new Map((await rows(tx, `select * from moderation_reports where id like '${tag}%'`)).map((r) => [r.id, r]));
      expect(reports.size).toBe(11);
      expect(reports.get(id(100))).toMatchObject({ module: 'blog', target_type: 'post', target_id: POST, organization_id: null, reporter_id: REP, reason: 'spam', status: 'open', description: 'd1 <script>x</script>', reporter_key: `legacy:${id(100)}`, legacy: { table: 'blog_reports', status: 'PENDING', reason: 'SPAM' } });
      expect(reports.get(id(101))).toMatchObject({ status: 'open', resolved_by: MOD, legacy: { status: 'REVIEWED' } });
      expect(reports.get(id(102))).toMatchObject({ target_type: 'review', status: 'resolved' });
      expect(reports.get(id(103))).toMatchObject({ status: 'dismissed', reporter_id: null, resolved_by: null });
      expect(reports.get(id(106))).toMatchObject({ organization_id: ORG, reason: 'other', status: 'open', legacy: { reason: 'WEIRD', status: 'ESCALATED' } });
      // Doublons ouverts conservés (clé legacy distincte) : aucun signalement perdu, groupés par cible dans la file.
      expect([reports.get(id(104))?.status, reports.get(id(105))?.status]).toEqual(['open', 'open']);
      expect(reports.get(id(200))).toMatchObject({ module: 'services', target_type: 'service', target_id: SERVICE, organization_id: ORG, reason: 'other', legacy: { table: 'service_reports', reason: 'Contenu trompeur' } });
      expect(reports.get(id(203))).toMatchObject({ target_type: 'review', reason: 'off_topic', status: 'open', legacy: { reason: 'off_topic', status: 'REVIEWED' } });
      expect(String(reports.get(id(100))?.created_at)).toBe(String(before.blog[0]?.created_at));
      const actions = new Map((await rows(tx, `select * from moderation_actions where id like '${tag}%'`)).map((r) => [r.id, r]));
      expect([...actions.values()].map((a) => a.action).sort()).toEqual(['approve', 'edit', 'reject', 'reset', 'trash']);
      expect(actions.get(id(301))).toMatchObject({ module: 'blog', target_type: 'comment', target_id: COMMENT, actor_id: MOD, note: 'typo', from_status: 'APPROVED', previous_values: { content: 'old <b>x</b>' } });
      expect(actions.get(id(304))).toMatchObject({ organization_id: ORG });
      expect(await rows(tx, `select to_regclass('blog_reports') as a, to_regclass('service_reports') as b, to_regclass('blog_comment_moderations') as c`)).toEqual([{ a: null, b: null, c: null }]);

      await run(tx, down);
      expect(await legacySnapshot(tx)).toEqual(before);
      // Rien n'est détruit : les tables génériques sont archivées.
      expect(Number((await rows(tx, `select count(*)::int as n from moderation_reports_0053_archive where id like '${tag}%'`))[0]?.n)).toBe(11);
    });
  });

  it('préserve les données génériques non exprimables (archives) et refuse un second retour arrière', async () => {
    await inRollback(async (tx) => {
      await toLegacy(tx);
      await seedLegacy(tx);
      await run(tx, up);
      // Nouvelles données : décision « hide » (inexprimable), signalement générique d'un avis de service,
      // historique dont le modérateur a été supprimé (inexprimable : moderator_id NOT NULL),
      // signalement historique ensuite clos par une décision générique (statut changé de sens).
      await tx.execute(sql`insert into moderation_actions (id, module, target_type, target_id, organization_id, actor_id, action, note, from_status, to_status) values
        (${id(400)}, 'services', 'review', ${SREVIEW}, ${ORG}, ${MOD}, 'hide', 'abus', 'APPROVED', 'REJECTED'),
        (${id(401)}, 'blog', 'comment', ${COMMENT}, null, null, 'approve', null, 'PENDING', 'APPROVED')`);
      await tx.execute(sql`insert into moderation_reports (id, module, target_type, target_id, organization_id, reporter_id, reporter_key, reason, status) values (${id(402)}, 'services', 'review', ${SREVIEW}, ${ORG}, ${REP}, 'h:abc', 'hate_speech', 'open')`);
      await tx.execute(sql`update moderation_reports set status = 'resolved', resolved_by = ${MOD}, resolved_at = now() where id = ${id(101)}`);

      await run(tx, down);
      const legacy = await legacySnapshot(tx);
      expect(legacy.services.find((r) => r.id === id(402))).toMatchObject({ review_id: SREVIEW, reason: 'HATE_SPEECH', status: 'PENDING', reporter_id: REP });
      // REVIEWED d'origine puis clos : le nouveau sens prime (RESOLVED), jamais une valeur périmée.
      expect(legacy.blog.find((r) => r.id === id(101))).toMatchObject({ status: 'RESOLVED' });
      expect(legacy.history.map((h) => h.id)).not.toContain(id(401));
      const archived = (await rows(tx, `select id, action from moderation_actions_0053_archive where id in ('${id(400)}', '${id(401)}') order by id`)).map((r) => r.action);
      expect(archived).toEqual(['hide', 'approve']);

      await run(tx, up);
      await expect(run(tx, down)).rejects.toThrow();
    });
  });

  it('les déclencheurs reproduisent la suppression en cascade avec la cible', async () => {
    await inRollback(async (tx) => {
      await toLegacy(tx);
      await seedLegacy(tx);
      await run(tx, up);
      await tx.execute(sql`delete from blog_comments where id = ${COMMENT}`);
      const left = (await rows(tx, `select target_id from moderation_reports where id like '${tag}%' union all select target_id from moderation_actions where id like '${tag}%'`)).map((r) => r.target_id);
      expect(left).not.toContain(COMMENT);
      await tx.execute(sql`delete from services where id = ${SERVICE}`);
      expect((await rows(tx, `select count(*)::int as n from moderation_reports where module = 'services' and id like '${tag}%'`))[0]?.n).toBe(0);
    });
  });
});
