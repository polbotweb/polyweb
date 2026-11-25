/**
 * Migration 0058 (banking + core/accounting + lots SEPA) : retour arrière puis ré-application
 * dans une transaction annulée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { getDrizzle } from '@/database/drizzle';
import { splitSqlStatements } from '@database/commands/_migration-sql';

const dir = resolve(process.cwd(), 'src/database/migrations');
const up = splitSqlStatements(readFileSync(resolve(dir, '0058_banking_reconciliation.sql'), 'utf8'));
const down = splitSqlStatements(readFileSync(resolve(dir, 'down/0058_banking_reconciliation.down.sql'), 'utf8'));
const journal = JSON.parse(readFileSync(resolve(dir, 'meta/_journal.json'), 'utf8')) as { entries: { idx: number; tag: string; when: number }[] };

class Rollback extends Error {}
type Tx = Parameters<Parameters<ReturnType<typeof getDrizzle>['transaction']>[0]>[0];
const rows = async (tx: Tx, query: ReturnType<typeof sql>) => (await tx.execute(query)).rows as Record<string, unknown>[];
const tables = (tx: Tx) => rows(tx, sql`select table_name from information_schema.tables where table_schema = 'public' and (table_name like 'bank\\_%' or table_name like 'accounting\\_%' or table_name = 'purchasing_sepa_export_lines') order by 1`);

/**
 * Le retour arrière (DDL) s'exécute pendant que d'autres fichiers d'intégration écrivent dans les
 * tables parentes (`user`, `organization`, `sites`…) : sans précaution, DROP TABLE prend ses verrous
 * au fil de l'eau et peut former un interblocage (40P01) avec une écriture concurrente.
 * On prend donc TOUS les verrous d'emblée, parents d'abord (aucun verrou détenu avant), avec un délai
 * borné, et on rejoue la transaction si elle est choisie comme victime (40P01) ou expire (55P03).
 */
const LOCKED = [
  '"user"', 'organization', 'approval_requests', 'document_sequences',
  'sales_documents', 'sales_payments', 'purchasing_invoices', 'purchasing_payments', 'purchasing_sepa_exports',
  'bank_payout_items', 'bank_payouts', 'bank_feed_connections', 'bank_rules', 'bank_ledger_lines', 'bank_ledger_entries',
  'bank_reconciliation_allocations', 'bank_reconciliation_lines', 'bank_reconciliations', 'bank_transactions', 'bank_statements',
  'bank_imports', 'bank_accounts', 'bank_csv_profiles', 'bank_settings', 'accounting_settings', 'accounting_accounts', 'purchasing_sepa_export_lines',
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

const addedColumns = (tx: Tx) => rows(tx, sql`select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name in ('sales_documents', 'sales_payments', 'purchasing_invoices', 'purchasing_payments', 'purchasing_sepa_exports') and column_name in ('lettering_code', 'lettering_date', 'bank_account_id', 'reconciliation_id', 'executed_at') order by 1, 2`);

describe('migration 0058 banking', () => {
  it('journal : 0058 après 0057 (ordre du migrateur)', () => {
    const e57 = journal.entries.find((e) => e.idx === 57)!;
    const e58 = journal.entries.find((e) => e.idx === 58)!;
    expect(e58.tag).toBe('0058_banking_reconciliation');
    expect(e58.when).toBeGreaterThan(e57.when);
  });

  it('down puis up : tables et colonnes recréées à l’identique', async () => {
    await exclusive(async (tx) => {
      const before = await tables(tx);
      const columns = await addedColumns(tx);
      expect(before.length).toBe(18);
      expect(columns.length).toBe(14);
      for (const s of down) await tx.execute(sql.raw(s));
      expect(await tables(tx)).toEqual([]);
      expect(await addedColumns(tx)).toEqual([]);
      for (const s of up) await tx.execute(sql.raw(s));
      expect(await tables(tx)).toEqual(before);
      expect(await addedColumns(tx)).toEqual(columns);
    });
  });
});
