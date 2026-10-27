/**
 * sales — exports FEC mensuels (base réelle, stockage privé local temporaire) : génération depuis
 * factures/avoirs/règlements émis, fichier conforme (colonnes, ISO 8859-15, tri, équilibre),
 * immuabilité d'un export prêt, échec motivé puis relance (manuelle forcée / cron après délai),
 * tâche mensuelle, action manuelle (RBAC, période close) et route de téléchargement (garde, empreinte).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: unknown) => def };
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { auditLog, organization, sales, salesFecExports, salesPayments, salesSellerProfiles, user } from '@database/schemas';
import { PrivateStorage, privateStorage } from '@/lib/storage/private';
import { resetRateLimiter } from '@/lib/rate-limit';
import { FEC_COLUMNS } from '@/modules/tax/domain/accounting';
import { decodeLatin9, sha256Hex } from '@/modules/sales/domain/fec';
import { salesService, type SalesDocumentInput } from '@/modules/sales/services/salesDocument.service';
import { fecExportOf, fecExportService, listFecExports, listFecExportsForAdmin } from '@/modules/sales/services/fecExport.service';
import { salesActions } from '@/modules/sales/actions';
import { GET as download } from '@/pages/[lang]/admin/sales/fec/[id]/download';

const db = getDrizzle();
const t = `fec-${Date.now().toString(36)}`;
const author = `${t}-author`;
const member = `${t}-member`;
const orgId = `${t}-org`;
const noSiren = `${t}-nosiren`;
const SIREN = '732829320';
const PERIOD = '2031-03';
const root = mkdtempSync(join(tmpdir(), 'pw-fec-'));
const previousDir = process.env.PRIVATE_STORAGE_DIR;
const previousDriver = process.env.STORAGE_DRIVER;
const run = <A, E>(effect: Effect.Effect<A, E, any>) => Effect.runPromise(Effect.provideService(effect, PrivateStorage, privateStorage()) as Effect.Effect<A, E, never>);
const owner = { userId: author, sessionId: null };
const h = (a: unknown) => (a as any).handler as (i: any, c: any) => Promise<any>;
const ctx = (id: string, role: string) => ({ locals: { user: { id, role, email: `${id}@test.local`, banned: false }, session: { id: `${id}-s` } }, request: { headers: new Headers({ 'user-agent': 'vitest' }) }, clientAddress: '127.0.0.1' }) as any;
const get = (id: string, context: any) => download({ ...context, params: { id, lang: 'fr' } } as any);

const draft = (organizationId: string, customerName: string, lines: SalesDocumentInput['lines']): SalesDocumentInput => ({
  kind: 'invoice', organizationId, title: `${t} invoice`, customerName, customerEmail: 'client@test.local',
  customerCountry: 'FR', customerType: 'B2B', customerVatNumber: 'FR12345678901', sellerCountry: 'FR', supplyType: 'services', currency: 'EUR', paymentTermDays: 30, lines,
});
const issue = async (input: SalesDocumentInput, day: string) => {
  const doc = await run(salesService.create(input, author, day));
  return run(salesService.transition(doc.id, 'ISSUED', owner, 'fr', day));
};

let invoiceA: Awaited<ReturnType<typeof issue>>;

beforeAll(async () => {
  process.env.STORAGE_DRIVER = 'local';
  process.env.PRIVATE_STORAGE_DIR = root;
  await db.insert(user).values([
    { id: author, name: 'FEC author', email: `${author}@test.local`, role: 'admin' },
    { id: member, name: 'FEC member', email: `${member}@test.local`, role: 'user' },
  ]);
  await db.insert(organization).values([
    { id: orgId, name: 'FEC org', slug: orgId, createdAt: new Date() },
    { id: noSiren, name: 'FEC no siren', slug: noSiren, createdAt: new Date() },
  ]);
  await db.insert(salesSellerProfiles).values({ organizationId: orgId, legalName: 'Vendeur Œuvres & Cie', legalId: SIREN, legalIdScheme: '0002', country: 'FR' });
  invoiceA = await issue(draft(orgId, 'Société Événements', [
    { description: 'Prestation', quantity: '1', unitPriceMinor: 10000, taxCategory: 'standard' },
    { description: 'Livre', quantity: '2', unitPriceMinor: 2500, taxCategory: 'reduced' },
  ]), '2031-03-10');
  await issue(draft(orgId, 'Zoé Œuvre', [{ description: 'Conseil', quantity: '1', unitPriceMinor: 20000, taxCategory: 'standard' }]), '2031-03-05');
  // Hors période (avril) : jamais exporté en mars.
  await issue(draft(orgId, 'Hors période', [{ description: 'X', quantity: '1', unitPriceMinor: 1000, taxCategory: 'standard' }]), '2031-04-01');
  // Brouillon dans la période : ignoré.
  await run(salesService.create(draft(orgId, 'Brouillon', [{ description: 'Y', quantity: '1', unitPriceMinor: 1000, taxCategory: 'standard' }]), author, '2031-03-12'));
  await run(salesService.recordPayment(invoiceA.id, { amountMinor: 5000, method: 'bank_transfer', paidAt: '2031-03-20', reference: 'VIR-42' }, author));
  const credit = await run(salesService.createCreditNote(invoiceA.id, author, { lines: [{ description: 'Geste', quantity: '1', unitPriceMinor: 1000, taxCategory: 'standard' }] }, '2031-03-25'));
  await run(salesService.transition(credit.id, 'ISSUED', owner, 'fr', '2031-03-25'));
  await issue(draft(noSiren, 'Client B', [{ description: 'Z', quantity: '1', unitPriceMinor: 1000, taxCategory: 'standard' }]), '2031-03-15');
  resetRateLimiter();
}, 60_000);

afterAll(async () => {
  await db.delete(salesFecExports).where(inArray(salesFecExports.period, [PERIOD, '2031-02']));
  await db.delete(auditLog).where(inArray(auditLog.userId, [author, member]));
  const ids = (await db.select({ id: sales.id }).from(sales).where(inArray(sales.organizationId, [orgId, noSiren]))).map((d) => d.id);
  if (ids.length) {
    await db.delete(salesPayments).where(inArray(salesPayments.documentId, ids));
    await db.delete(sales).where(and(inArray(sales.organizationId, [orgId, noSiren]), inArray(sales.id, ids)));
  }
  await db.delete(organization).where(inArray(organization.id, [orgId, noSiren]));
  await db.delete(user).where(inArray(user.id, [author, member]));
  if (previousDir === undefined) delete process.env.PRIVATE_STORAGE_DIR; else process.env.PRIVATE_STORAGE_DIR = previousDir;
  if (previousDriver === undefined) delete process.env.STORAGE_DRIVER; else process.env.STORAGE_DRIVER = previousDriver;
  rmSync(root, { recursive: true, force: true });
});

const rowsOf = (content: string) => content.slice(0, -2).split('\r\n').map((row) => row.split('|'));

describe('FEC — génération (tenant, période)', () => {
  let exportId = '';

  it('fichier conforme : nom, 18 colonnes, CRLF, ISO 8859-15, tri, numérotation, équilibre ; empreinte et totaux enregistrés', async () => {
    const result = await run(fecExportService.generate({ organizationId: orgId, period: PERIOD, authorId: author }));
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    const row = result.export;
    exportId = row.id;
    expect(row).toMatchObject({ filename: `${SIREN}FEC20310331.txt`, storageKey: `fec/${orgId}/${PERIOD}/${SIREN}FEC20310331.txt`, error: null, attempts: 1, generatedBy: author });
    const bytes = await Effect.runPromise(privateStorage().get(row.storageKey!));
    expect(bytes.byteLength).toBe(row.sizeBytes);
    expect(sha256Hex(bytes)).toBe(row.sha256);
    expect([...bytes.slice(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.includes(0xbc)).toBe(true); // « Œ » ISO 8859-15
    expect(bytes.includes(0xc3)).toBe(false); // pas d'UTF-8 (« é » = 0xC3 0xA9)
    const content = decodeLatin9(bytes);
    expect(content.endsWith('\r\n')).toBe(true);
    expect(content).toContain('Zoé Œuvre');
    const rows = rowsOf(content);
    expect(rows[0]).toEqual([...FEC_COLUMNS]);
    for (const r of rows) expect(r).toHaveLength(18);
    const body = rows.slice(1);
    // Écritures : 05/03 VE (Zoé), 10/03 VE (A), 20/03 BQ (règlement), 25/03 VE (avoir) ; ni brouillon ni avril.
    const entries = [...new Map(body.map((r) => [r[2], [r[0], r[3], r[8]]])).entries()].map(([num, rest]) => [num, ...rest!]);
    expect(entries.map((e) => [e[0], e[2]])).toEqual([
      ['VE20310300001', '20310305'], ['VE20310300002', '20310310'], ['BQ20310300001', '20310320'], ['VE20310300003', '20310325'],
    ]);
    expect(entries[2]![3]).toBe('VIR-42');
    expect(body.every((r) => r[3]! >= '20310301' && r[3]! <= '20310331')).toBe(true);
    const cents = (v: string) => Math.round(Number(v.replace(',', '.')) * 100);
    const debit = body.reduce((s, r) => s + cents(r[11]!), 0);
    const credit = body.reduce((s, r) => s + cents(r[12]!), 0);
    expect(debit).toBe(credit);
    expect(row.debitMinor).toBe(debit);
    expect(row.creditMinor).toBe(credit);
    expect(row.lineCount).toBe(body.length);
    expect(row.entryCount).toBe(4);
    // Avoir : 411 au crédit.
    const avoir = body.find((r) => r[2] === 'VE20310300003' && r[4] === '411000')!;
    expect(cents(avoir[12]!)).toBe(1200);
    // Par écriture, équilibre.
    for (const num of new Set(body.map((r) => r[2]))) {
      const lines = body.filter((r) => r[2] === num);
      expect(lines.reduce((s, r) => s + cents(r[11]!), 0)).toBe(lines.reduce((s, r) => s + cents(r[12]!), 0));
    }
  });

  it('export prêt figé : nouvelle génération (même forcée) ignorée, fichier inchangé', async () => {
    const before = (await run(fecExportOf(exportId)))!;
    expect(await run(fecExportService.generate({ organizationId: orgId, period: PERIOD, authorId: author, force: true }))).toEqual({ status: 'SKIPPED' });
    const after = (await run(fecExportOf(exportId)))!;
    expect(after.sha256).toBe(before.sha256);
    expect(after.attempts).toBe(1);
  });

  it('sans SIREN : échec motivé ; relance manuelle forcée immédiate, cron seulement après le délai', async () => {
    const failed = await run(fecExportService.generate({ organizationId: noSiren, period: PERIOD, authorId: author }));
    expect(failed).toMatchObject({ status: 'FAILED' });
    if (failed.status !== 'FAILED') return;
    expect(failed.error).toMatch(/siren/);
    expect(await run(fecExportService.generate({ organizationId: noSiren, period: PERIOD, authorId: null }))).toEqual({ status: 'SKIPPED' });
    expect((await run(fecExportService.generate({ organizationId: noSiren, period: PERIOD, authorId: author, force: true }))).status).toBe('FAILED');
    expect((await run(fecExportOf(failed.exportId)))).toMatchObject({ status: 'FAILED', attempts: 2, storageKey: null });
    // Le profil est complété ; le cron relance une fois le délai écoulé.
    await db.insert(salesSellerProfiles).values({ organizationId: noSiren, legalName: 'B', legalId: `${SIREN}00015`, legalIdScheme: '0009', country: 'FR' });
    await db.update(salesFecExports).set({ attemptedAt: sql`now() - interval '2 hours'` }).where(eq(salesFecExports.id, failed.exportId));
    const counts = await run(fecExportService.runMonthly(new Date('2031-04-02T03:00:00Z'), 500));
    expect(counts.period).toBe(PERIOD);
    expect(counts.ready).toBeGreaterThanOrEqual(1);
    expect(await run(fecExportOf(failed.exportId))).toMatchObject({ status: 'READY', attempts: 3, generatedBy: null, error: null });
  });

  it('cron : un second passage ne refait rien pour ces tenants ; PENDING périmé repris', async () => {
    const again = await run(fecExportService.runMonthly(new Date('2031-04-02T04:00:00Z'), 500));
    expect(again).toMatchObject({ period: PERIOD, ready: 0, failed: 0 });
    await db.update(salesFecExports).set({ status: 'PENDING', attemptedAt: sql`now() - interval '1 minute'` }).where(and(eq(salesFecExports.organizationId, noSiren), eq(salesFecExports.period, PERIOD)));
    expect(await run(fecExportService.generate({ organizationId: noSiren, period: PERIOD, authorId: null }))).toEqual({ status: 'SKIPPED' });
    await db.update(salesFecExports).set({ attemptedAt: sql`now() - interval '20 minutes'` }).where(and(eq(salesFecExports.organizationId, noSiren), eq(salesFecExports.period, PERIOD)));
    expect((await run(fecExportService.generate({ organizationId: noSiren, period: PERIOD, authorId: null }))).status).toBe('READY');
  });

  it('période vide : fichier avec en-tête seul ; période invalide refusée', async () => {
    const empty = await run(fecExportService.generate({ organizationId: orgId, period: '2031-02', authorId: author }));
    expect(empty.status).toBe('READY');
    if (empty.status === 'READY') expect(empty.export).toMatchObject({ entryCount: 0, lineCount: 0, debitMinor: 0, creditMinor: 0 });
    await expect(run(fecExportService.generate({ organizationId: orgId, period: '2031-13', authorId: author }))).rejects.toMatchObject({ reason: 'period' });
  });

  it('listes : par tenant et back-office (nom du tenant, auteur ou cron)', async () => {
    const mine = await run(listFecExports({ organizationId: orgId }));
    expect(mine.map((r) => r.period)).toEqual(['2031-03', '2031-02']);
    const admin = await run(listFecExportsForAdmin(500));
    const row = admin.find((r) => r.organizationId === noSiren && r.period === PERIOD)!;
    expect(row).toMatchObject({ organizationName: 'FEC no siren', status: 'READY', generatedByName: null });
    expect(admin.find((r) => r.organizationId === orgId && r.period === PERIOD)!.generatedByName).toBe('FEC author');
  });
});

describe('FEC — téléchargement', () => {
  const exportOf = async () => (await db.select().from(salesFecExports).where(and(eq(salesFecExports.organizationId, orgId), eq(salesFecExports.period, PERIOD))))[0]!;

  it('sans session 401, id invalide ou inconnu 404, sans permission 403', async () => {
    const row = await exportOf();
    expect((await get(row.id, { ...ctx(author, 'admin'), locals: {} })).status).toBe(401);
    expect((await get('not-a-uuid', ctx(author, 'admin'))).status).toBe(404);
    expect((await get(crypto.randomUUID(), ctx(author, 'admin'))).status).toBe(404);
    expect((await get(row.id, ctx(member, 'user'))).status).toBe(403);
  });

  it('admin : octets identiques, en-têtes privés, audit', async () => {
    const row = await exportOf();
    const response = await get(row.id, ctx(author, 'admin'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=ISO-8859-15');
    expect(response.headers.get('content-disposition')).toBe(`attachment; filename="${row.filename}"`);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-content-sha256')).toBe(row.sha256);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(sha256Hex(bytes)).toBe(row.sha256);
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.userId, author), eq(auditLog.action, 'SALES_FEC_DOWNLOAD')));
    expect(audits.some((a) => a.resourceId === row.id)).toBe(true);
  });

  it('fichier altéré en stockage : 500, rien n’est servi', async () => {
    const row = await exportOf();
    writeFileSync(join(root, row.storageKey!), 'altéré');
    expect((await get(row.id, ctx(author, 'admin'))).status).toBe(500);
  });
});

describe('FEC — action manuelle', () => {
  it('RBAC (issue) ; mois en cours ou futur refusé', async () => {
    const generate = h(salesActions.generateFecExport);
    await expect(generate({ organizationId: orgId, period: '2031-01' }, ctx(member, 'user'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const now = new Date();
    const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    await expect(generate({ organizationId: orgId, period: current }, ctx(author, 'admin'))).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(generate({ organizationId: orgId, period: '2031-02' }, ctx(author, 'admin'))).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('mois révolu : génération forcée, retour statut et audit', async () => {
    const generate = h(salesActions.generateFecExport);
    const first = await generate({ organizationId: orgId, period: '2020-01' }, ctx(author, 'admin'));
    expect(first.status).toBe('READY');
    await expect(generate({ organizationId: orgId, period: '2020-01' }, ctx(author, 'admin'))).rejects.toMatchObject({ code: 'CONFLICT' });
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.userId, author), eq(auditLog.action, 'SALES_FEC_GENERATE')));
    expect(audits.some((a) => a.resourceId === first.id)).toBe(true);
    await db.delete(salesFecExports).where(eq(salesFecExports.period, '2020-01'));
  });
});
