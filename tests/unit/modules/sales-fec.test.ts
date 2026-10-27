/** Export FEC (pur) : période, SIREN, écritures VE/BQ (tri, numérotation, équilibre), colonnes, encodage ISO 8859-15, stockage privé. */
import { describe, expect, it } from 'vitest';
import { Effect, Exit } from 'effect';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FEC_COLUMNS, toFec } from '@/modules/tax/domain/accounting';
import {
  buildFecEntries, compareFecEntries, customerAuxAccount, decodeLatin9, encodeLatin9, fecSirenOf, fecStorageKey, FecExportError,
  isClosedFecPeriod, normalizeRate, parseFecPeriod, previousFecPeriod, sha256Hex, type FecDocument, type FecPayment,
} from '@/modules/sales/domain/fec';
import { privateStorageFromEnv, resolvePrivateStorage } from '@/lib/storage/private';
import { ConfigError } from '@/lib/effect/errors';

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSync(effect);
const failure = <A, E extends { readonly _tag: string }>(effect: Effect.Effect<A, E>) => {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) throw new Error('expected failure');
  const error = exit.cause.reasons.find((r) => r._tag === 'Fail')?.error as (E & Partial<FecExportError>) | undefined;
  return error!;
};

const SIREN = '732829320';
const march = run(parseFecPeriod('2026-03'));
const invoice = (over: Partial<FecDocument> = {}): FecDocument => ({
  id: 'doc-1', kind: 'invoice', number: 'FA-2026-00001', issueDate: '2026-03-10', currency: 'EUR', customerName: 'Société Événements', customerVatNumber: 'FR12345678901',
  netMinor: 15000, taxMinor: 2275, grossMinor: 17275,
  lines: [{ netMinor: 10000, ratePercent: '20.0000' }, { netMinor: 5000, ratePercent: '5.5000' }],
  ...over,
});
const payment = (over: Partial<FecPayment> = {}): FecPayment => ({
  id: 'pay-1', paidAt: '2026-03-15', amountMinor: 17275, currency: 'EUR', method: 'transfer', reference: 'VIR-1', documentNumber: 'FA-2026-00001',
  customerName: 'Société Événements', customerVatNumber: 'FR12345678901', ...over,
});

describe('FEC — période', () => {
  it('bornes du mois, février bissextile et non bissextile', () => {
    expect(march).toEqual({ period: '2026-03', start: '2026-03-01', endExclusive: '2026-04-01', lastDay: '2026-03-31' });
    expect(run(parseFecPeriod('2028-02')).lastDay).toBe('2028-02-29');
    expect(run(parseFecPeriod('2026-02')).lastDay).toBe('2026-02-28');
    expect(run(parseFecPeriod('2026-12')).endExclusive).toBe('2027-01-01');
  });
  it('formats invalides refusés', () => {
    for (const bad of ['2026-13', '2026-00', '2026-3', '26-03', '1999-12', '2026-03-01', '']) expect(failure(parseFecPeriod(bad)).reason).toBe('period');
  });
  it('mois précédent et période close (UTC)', () => {
    expect(previousFecPeriod(new Date('2026-01-01T00:00:00Z'))).toBe('2025-12');
    expect(previousFecPeriod(new Date('2026-03-31T23:59:59Z'))).toBe('2026-02');
    expect(isClosedFecPeriod('2026-02', new Date('2026-03-01T00:00:00Z'))).toBe(true);
    expect(isClosedFecPeriod('2026-03', new Date('2026-03-31T23:00:00Z'))).toBe(false);
    expect(isClosedFecPeriod('2027-01', new Date('2026-03-31T23:00:00Z'))).toBe(false);
  });
});

describe('FEC — SIREN du vendeur', () => {
  it('SIREN (0002) et SIRET (0009) → 9 chiffres, clé de Luhn vérifiée', () => {
    expect(run(fecSirenOf({ legalId: '732 829 320', legalIdScheme: '0002' }))).toBe(SIREN);
    expect(run(fecSirenOf({ legalId: `${SIREN}00015`, legalIdScheme: '0009' }))).toBe(SIREN);
  });
  it('absent, invalide ou schéma inconnu → échec motivé', () => {
    expect(failure(fecSirenOf(null))).toMatchObject({ reason: 'siren', detail: 'profil vendeur absent' });
    expect(failure(fecSirenOf({ legalId: '732829321', legalIdScheme: '0002' })).reason).toBe('siren');
    expect(failure(fecSirenOf({ legalId: SIREN, legalIdScheme: '0088' })).reason).toBe('siren');
    expect(failure(fecSirenOf({ legalId: '7328293200001', legalIdScheme: '0009' })).reason).toBe('siren');
  });
});

describe('FEC — écritures', () => {
  it('facture : 411 TTC au débit, 706 et 44571 par taux au crédit, taux normalisés (ordre croissant)', () => {
    const { entries, summary } = run(buildFecEntries({ period: march, documents: [invoice()], payments: [] }));
    expect(entries).toHaveLength(1);
    const lines = entries[0]!.lines.map((l) => [l.account, l.accountLabel, l.debit.amountMinor, l.credit.amountMinor]);
    expect(lines).toEqual([
      ['411000', 'Clients', 17275, 0],
      ['706000', 'Ventes 5.5 %', 0, 5000], ['706000', 'Ventes 20 %', 0, 10000],
      ['445710', 'TVA collectée 5.5 %', 0, 275], ['445710', 'TVA collectée 20 %', 0, 2000],
    ]);
    expect(entries[0]!.lines[0]!.auxAccount).toBe(customerAuxAccount('Société Événements', 'FR12345678901'));
    expect(summary).toEqual({ entryCount: 1, lineCount: 5, debitMinor: 17275, creditMinor: 17275 });
  });

  it('avoir et remboursement : sens inversés ; montants nuls ignorés', () => {
    const credit = invoice({ id: 'doc-2', kind: 'credit_note', number: 'AV-2026-00001', issueDate: '2026-03-20', netMinor: 10000, taxMinor: 2000, grossMinor: 12000, lines: [{ netMinor: 10000, ratePercent: '20' }] });
    const { entries, summary } = run(buildFecEntries({ period: march, documents: [credit], payments: [payment({ id: 'r', amountMinor: -12000, paidAt: '2026-03-21', reference: null, documentNumber: 'AV-2026-00001' }), payment({ id: 'z', amountMinor: 0 })] }));
    expect(entries.map((e) => e.entryNumber)).toEqual(['VE20260300001', 'BQ20260300001']);
    expect(entries[0]!.lines[0]).toMatchObject({ account: '411000', credit: { amountMinor: 12000 } });
    expect(entries[1]!.lines.map((l) => [l.account, l.debit.amountMinor, l.credit.amountMinor])).toEqual([['512000', 0, 12000], ['411000', 12000, 0]]);
    expect(entries[1]!.pieceRef).toBe('AV-2026-00001');
    expect(entries[1]!.lines[0]!.label).toMatch(/^Remboursement /);
    expect(summary.debitMinor).toBe(summary.creditMinor);
  });

  it('tri (date, VE avant BQ, pièce, id), numérotation continue par journal, hors période exclus', () => {
    const docs = [
      invoice({ id: 'b', number: 'FA-2026-00003', issueDate: '2026-03-15' }),
      invoice({ id: 'a', number: 'FA-2026-00002', issueDate: '2026-03-15' }),
      invoice({ id: 'c', number: 'FA-2026-00001', issueDate: '2026-03-01' }),
      invoice({ id: 'out', number: 'FA-2026-00099', issueDate: '2026-04-01' }),
    ];
    const pays = [payment({ id: 'p2', paidAt: '2026-03-15', reference: 'A' }), payment({ id: 'p1', paidAt: '2026-03-02' }), payment({ id: 'old', paidAt: '2026-02-28' })];
    const { entries } = run(buildFecEntries({ period: march, documents: docs, payments: pays }));
    expect(entries.map((e) => [e.entryDate, e.entryNumber, e.pieceRef])).toEqual([
      ['2026-03-01', 'VE20260300001', 'FA-2026-00001'],
      ['2026-03-02', 'BQ20260300001', 'VIR-1'],
      ['2026-03-15', 'VE20260300002', 'FA-2026-00002'],
      ['2026-03-15', 'VE20260300003', 'FA-2026-00003'],
      ['2026-03-15', 'BQ20260300002', 'A'],
    ]);
    const shuffled = run(buildFecEntries({ period: march, documents: [...docs].reverse(), payments: [...pays].reverse() }));
    expect(shuffled.entries).toEqual(entries);
    expect(compareFecEntries({ journal: 'BQ', date: '2026-03-01', pieceRef: 'A', sortId: '1' }, { journal: 'VE', date: '2026-03-01', pieceRef: 'Z', sortId: '0' })).toBeGreaterThan(0);
  });

  it('totaux incohérents ou devise étrangère → échec (jamais de fichier faux)', () => {
    expect(failure(buildFecEntries({ period: march, documents: [invoice({ taxMinor: 2276, grossMinor: 17276 })], payments: [] })).reason).toBe('totals');
    expect(failure(buildFecEntries({ period: march, documents: [invoice({ currency: 'USD' })], payments: [] })).reason).toBe('currency');
    expect(failure(buildFecEntries({ period: march, documents: [], payments: [payment({ currency: 'GBP' })] })).reason).toBe('currency');
  });

  it('période vide : aucune écriture, sommaire à zéro', () => {
    expect(run(buildFecEntries({ period: march, documents: [], payments: [] })).summary).toEqual({ entryCount: 0, lineCount: 0, debitMinor: 0, creditMinor: 0 });
  });

  it('utilitaires : taux, compte auxiliaire stable et normalisé, clé de stockage', () => {
    expect(['20.0000', '5.5000', '0.0000', '2.1', '10'].map(normalizeRate)).toEqual(['20', '5.5', '0', '2.1', '10']);
    expect(customerAuxAccount('  Société   ÉVÉNEMENTS ', 'fr 12345678901')).toBe(customerAuxAccount('société événements', 'FR12345678901'));
    expect(customerAuxAccount('A', null)).toMatch(/^C[0-9A-F]{10}$/);
    expect(customerAuxAccount('A', null)).not.toBe(customerAuxAccount('B', null));
    expect(fecStorageKey(null, '2026-03', 'x.txt')).toBe('fec/platform/2026-03/x.txt');
    expect(fecStorageKey('org/../a b', '2026-03', 'x.txt')).toBe('fec/org_.._a_b/2026-03/x.txt');
  });
});

describe('FEC — fichier (colonnes, séparateur, encodage)', () => {
  const file = run(Effect.gen(function* () {
    const { entries } = yield* buildFecEntries({ period: march, documents: [invoice()], payments: [payment()] });
    return yield* toFec(entries, { siren: SIREN, closingDate: march.lastDay });
  }));

  it('nom <SIREN>FEC<AAAAMMJJ>.txt, 18 colonnes réglementaires, CRLF, dates AAAAMMJJ, virgule décimale', () => {
    expect(file.filename).toBe(`${SIREN}FEC20260331.txt`);
    expect(file.content.endsWith('\r\n')).toBe(true);
    const rows = file.content.slice(0, -2).split('\r\n');
    expect(rows[0]).toBe(FEC_COLUMNS.join('|'));
    expect(FEC_COLUMNS).toHaveLength(18);
    expect(rows).toHaveLength(1 + 5 + 2);
    for (const row of rows) expect(row.split('|')).toHaveLength(18);
    const first = rows[1]!.split('|');
    expect(first.slice(0, 5)).toEqual(['VE', 'Ventes', 'VE20260300001', '20260310', '411000']);
    expect(first[11]).toBe('172,75');
    expect(first[12]).toBe('0,00');
    expect(first[15]).toBe('20260310');
    const bank = rows[6]!.split('|');
    expect(bank.slice(0, 5)).toEqual(['BQ', 'Banque', 'BQ20260300001', '20260315', '512000']);
    // Équilibre global du fichier.
    const total = (index: number) => rows.slice(1).reduce((sum, row) => sum + Math.round(Number(row.split('|')[index]!.replace(',', '.')) * 100), 0);
    expect(total(11)).toBe(total(12));
  });

  it('ISO 8859-15 : €=0xA4, œ=0xBD, é=0xE9, pas de BOM ; hors jeu → translittération ou « ? »', () => {
    const bytes = encodeLatin9(file.content);
    expect([...bytes.slice(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.every((b) => b <= 0xff)).toBe(true);
    expect(decodeLatin9(bytes)).toBe(file.content);
    expect([...encodeLatin9('€œŒŠšŽžŸé\r\n')]).toEqual([0xa4, 0xbd, 0xbc, 0xa6, 0xa8, 0xb4, 0xb8, 0xbe, 0xe9, 0x0d, 0x0a]);
    expect([...encodeLatin9('ą')]).toEqual([0x61]);
    expect(decodeLatin9(encodeLatin9('漢😀'))).toBe('??');
    expect(decodeLatin9(encodeLatin9('\u00a4'))).toBe('?');
    expect(sha256Hex(bytes)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('séparateur et retours ligne neutralisés dans les libellés', () => {
    const { entries } = run(buildFecEntries({ period: march, documents: [invoice({ customerName: 'A|B\r\nC\tD' })], payments: [] }));
    const content = run(toFec(entries, { siren: SIREN, closingDate: march.lastDay })).content;
    for (const row of content.slice(0, -2).split('\r\n')) expect(row.split('|')).toHaveLength(18);
  });
});

describe('Stockage privé — configuration', () => {
  it('local : hors public/, répertoire configurable', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pw-priv-'));
    expect(privateStorageFromEnv({}, cwd)).not.toBeInstanceOf(ConfigError);
    expect(privateStorageFromEnv({ PRIVATE_STORAGE_DIR: 'public/x' }, cwd)).toBeInstanceOf(ConfigError);
    expect(privateStorageFromEnv({ PRIVATE_STORAGE_DIR: 'public' }, cwd)).toBeInstanceOf(ConfigError);
    expect(privateStorageFromEnv({ PRIVATE_STORAGE_DIR: 'publicity' }, cwd)).not.toBeInstanceOf(ConfigError);
  });
  it('s3/r2 : bucket privé obligatoire et distinct du bucket média ; driver inconnu refusé', () => {
    const s3 = { STORAGE_DRIVER: 's3', S3_BUCKET: 'media', S3_ENDPOINT: 'http://localhost:8333', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's', S3_REGION: 'us-east-1' };
    expect(privateStorageFromEnv(s3)).toMatchObject({ key: 'S3_PRIVATE_BUCKET' });
    expect(privateStorageFromEnv({ ...s3, S3_PRIVATE_BUCKET: 'media' })).toMatchObject({ key: 'S3_PRIVATE_BUCKET' });
    expect(privateStorageFromEnv({ ...s3, S3_PRIVATE_BUCKET: 'private' })).not.toBeInstanceOf(ConfigError);
    expect(privateStorageFromEnv({ STORAGE_DRIVER: 'ftp' })).toMatchObject({ key: 'STORAGE_DRIVER' });
  });
  it('configuration invalide : chaque opération échoue (jamais de repli public)', async () => {
    const storage = resolvePrivateStorage({ STORAGE_DRIVER: 's3', S3_BUCKET: 'media' });
    const exit = await Effect.runPromiseExit(storage.put('fec/x.txt', new Uint8Array([1]), { contentType: 'text/plain' }));
    expect(Exit.isFailure(exit)).toBe(true);
    expect(storage.publicUrl('fec/x.txt')).toBe('');
  });
});
