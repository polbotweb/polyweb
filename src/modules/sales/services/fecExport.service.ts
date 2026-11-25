/**
 * Génération des exports FEC mensuels par tenant (organisation, `null` = plateforme).
 *
 * Verrou logique sans transaction longue : une ligne `sales_fec_exports` par (tenant, période) ;
 * `claim` la passe en `PENDING` par un seul `INSERT … ON CONFLICT DO UPDATE … WHERE` atomique —
 * nouvelle période, échec à relancer (forcé, ou ancien d'au moins `retryAfter`) ou génération
 * `PENDING` périmée (processus interrompu). Un export `READY` est figé (archive : jamais régénéré).
 * Toutes les dates de verrou sont celles du serveur SQL (`now()`).
 *
 * Écritures : factures / avoirs numérotés émis dans la période (ni brouillon ni annulé) et
 * règlements datés de la période (domaine `fec.ts`). Fichier : `toFec` puis ISO 8859-15, stocké en
 * privé (`PrivateStorage`) avec empreinte SHA-256 et totaux ; tout échec est consigné (`FAILED`).
 */
import { purchasingInvoices, purchasingInvoiceLines, purchasingPayments, purchasingSuppliers } from "@/modules/purchasing/schema";
import { Effect } from "effect";
import { and, asc, desc, eq, gte, inArray, isNull, lt, notInArray, sql, type SQL } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { organization, user } from "@database/schemas/auth.schema";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { PrivateStorage } from "@/lib/storage/private";
import { toFec } from "@/modules/tax/domain/accounting";
import { accountingConfig } from "@/core/accounting/service";
import { bankAccounts, bankLedgerEntries, bankLedgerLines } from "@/modules/banking/schema";
import { sales, salesDocumentLines, salesFecExports, salesPayments, salesSellerProfiles } from "../schema";
import {
  buildFecEntries, encodeLatin9, FEC_CONTENT_TYPE, fecSirenOf, fecStorageKey, parseFecPeriod, previousFecPeriod, sha256Hex,
  type FecBankAccount, type FecDocument, type FecFrozen, type FecLedgerEntry, type FecLettering, type FecPayment, type FecPeriod,
} from "../domain/fec";

export type FecExportRow = typeof salesFecExports.$inferSelect;

/** Délai avant relance automatique d'un export en échec. */
export const FEC_RETRY_AFTER_MINUTES = 60;
/** Une génération `PENDING` plus ancienne est considérée interrompue. */
export const FEC_STALE_PENDING_MINUTES = 15;
/** Nombre maximal de tenants traités par appel du cron. */
export const FEC_CRON_BATCH = 20;

const tenantOf = (column: Parameters<typeof eq>[0], organizationId: string | null): SQL =>
  organizationId === null ? isNull(column) : eq(column, organizationId);

/** Réserve (tenant, période) ; renvoie l'id de la ligne `PENDING`, ou null si rien à faire. */
const claim = (organizationId: string | null, period: string, authorId: string | null, force: boolean) =>
  dbTry("sales.fec.claim", () => getDrizzle().execute<{ id: string }>(sql`
    INSERT INTO sales_fec_exports (id, organization_id, period, status, attempts, generated_by, attempted_at, updated_at)
    VALUES (${crypto.randomUUID()}, ${organizationId}, ${period}, 'PENDING', 1, ${authorId}, now(), now())
    ON CONFLICT (coalesce(organization_id, ''), period) DO UPDATE
      SET status = 'PENDING', attempts = sales_fec_exports.attempts + 1, generated_by = excluded.generated_by,
          error = NULL, attempted_at = now(), updated_at = now()
      WHERE (sales_fec_exports.status = 'FAILED' AND (${force} OR sales_fec_exports.attempted_at < now() - make_interval(mins => ${FEC_RETRY_AFTER_MINUTES})))
         OR (sales_fec_exports.status = 'PENDING' AND sales_fec_exports.attempted_at < now() - make_interval(mins => ${FEC_STALE_PENDING_MINUTES}))
    RETURNING id`)).pipe(Effect.map((result) => result.rows[0]?.id ?? null));

/** Contre-valeur figée à l'émission (core/fx). */
const frozenColumns = {
  baseCurrency: sales.baseCurrency, exchangeRate: sales.exchangeRate,
  netBaseMinor: sales.netBaseMinor, taxBaseMinor: sales.taxBaseMinor, grossBaseMinor: sales.grossBaseMinor,
};
type FrozenRow = { [K in keyof typeof frozenColumns]: (typeof frozenColumns)[K]["_"]["data"] | null };
const purchaseFrozenColumns = {
  baseCurrency: purchasingInvoices.baseCurrency, exchangeRate: purchasingInvoices.exchangeRate,
  netBaseMinor: purchasingInvoices.netBaseMinor, taxBaseMinor: purchasingInvoices.taxBaseMinor, grossBaseMinor: purchasingInvoices.grossBaseMinor,
};

const frozenOf = (row: FrozenRow): FecFrozen | null =>
  row.baseCurrency && row.exchangeRate && row.netBaseMinor !== null && row.taxBaseMinor !== null && row.grossBaseMinor !== null
    ? { baseCurrency: row.baseCurrency, exchangeRate: row.exchangeRate, netBaseMinor: row.netBaseMinor, taxBaseMinor: row.taxBaseMinor, grossBaseMinor: row.grossBaseMinor }
    : null;

const letteringOf = (code: string | null, date: string | null): FecLettering | null => (code && date ? { code, date } : null);

/** Comptes bancaires du tenant (compte 512xxx et journal propres), par id. */
const loadBankAccounts = (organizationId: string | null) =>
  dbTry("sales.fec.bankAccounts", () => getDrizzle().select({
    id: bankAccounts.id, account: bankAccounts.ledgerAccount, accountLabel: bankAccounts.label, journalCode: bankAccounts.journalCode, journalLabel: bankAccounts.journalLabel,
  }).from(bankAccounts).where(tenantOf(bankAccounts.organizationId, organizationId))).pipe(
    Effect.map((rows) => new Map<string, FecBankAccount>(rows.map((row) => [row.id, { account: row.account, accountLabel: row.accountLabel, journalCode: row.journalCode, journalLabel: row.journalLabel }]))),
  );

/** Écritures du grand livre banque datées de la période (frais, écarts, change, virements, règles). */
const loadLedgerEntries = (organizationId: string | null, range: FecPeriod) =>
  Effect.gen(function* () {
    const entries = yield* dbTry("sales.fec.ledger", () => getDrizzle().select().from(bankLedgerEntries).where(and(
      tenantOf(bankLedgerEntries.organizationId, organizationId), gte(bankLedgerEntries.date, range.start), lt(bankLedgerEntries.date, range.endExclusive),
    )).orderBy(asc(bankLedgerEntries.date), asc(bankLedgerEntries.createdAt), asc(bankLedgerEntries.id)));
    if (entries.length === 0) return [];
    const lines = yield* dbTry("sales.fec.ledger.lines", () => getDrizzle().select().from(bankLedgerLines)
      .where(inArray(bankLedgerLines.entryId, entries.map((entry) => entry.id))).orderBy(asc(bankLedgerLines.entryId), asc(bankLedgerLines.position)));
    const byEntry = Map.groupBy(lines, (line) => line.entryId);
    return entries.map((entry): FecLedgerEntry => ({
      id: entry.id, date: entry.date, journalCode: entry.journalCode, journalLabel: entry.journalLabel, pieceRef: entry.pieceRef,
      lines: (byEntry.get(entry.id) ?? []).map((line) => ({
        account: line.account, accountLabel: line.accountLabel, auxAccount: line.auxAccount, auxLabel: line.auxLabel, label: line.label,
        debitMinor: line.debitMinor, creditMinor: line.creditMinor, foreignMinor: line.foreignMinor, foreignCurrency: line.foreignCurrency, lettering: line.lettering, letteringDate: line.letteringDate,
      })),
    }));
  });

const loadDocuments = (organizationId: string | null, range: FecPeriod) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const docs = yield* dbTry("sales.fec.documents", () => db.select({
      id: sales.id, kind: sales.kind, number: sales.number, issueDate: sales.issueDate, currency: sales.currency,
      customerName: sales.customerName, customerVatNumber: sales.customerVatNumber, netMinor: sales.netMinor, taxMinor: sales.taxMinor, grossMinor: sales.grossMinor,
      letteringCode: sales.letteringCode, letteringDate: sales.letteringDate,
      ...frozenColumns,
    }).from(sales).where(and(
      tenantOf(sales.organizationId, organizationId),
      inArray(sales.kind, ["invoice", "credit_note"]),
      notInArray(sales.status, ["DRAFT", "CANCELLED"]),
      sql`${sales.number} is not null`,
      gte(sales.issueDate, range.start), lt(sales.issueDate, range.endExclusive),
    )).orderBy(asc(sales.issueDate), asc(sales.number)));
    const ids = docs.map((doc) => doc.id);
    const lines = ids.length === 0 ? [] : yield* dbTry("sales.fec.lines", () => db.select({ documentId: salesDocumentLines.documentId, netMinor: salesDocumentLines.netMinor, ratePercent: salesDocumentLines.ratePercent })
      .from(salesDocumentLines).where(inArray(salesDocumentLines.documentId, ids)).orderBy(asc(salesDocumentLines.documentId), asc(salesDocumentLines.position)));
    const byDocument = Map.groupBy(lines, (line) => line.documentId);
    return docs.map((doc): FecDocument => ({
      id: doc.id, kind: doc.kind as FecDocument["kind"], number: doc.number!, issueDate: doc.issueDate!, currency: doc.currency,
      customerName: doc.customerName, customerVatNumber: doc.customerVatNumber, netMinor: doc.netMinor, taxMinor: doc.taxMinor, grossMinor: doc.grossMinor,
      lines: (byDocument.get(doc.id) ?? []).map((line) => ({ netMinor: line.netMinor, ratePercent: line.ratePercent })),
      fx: frozenOf(doc), lettering: letteringOf(doc.letteringCode, doc.letteringDate),
    }));
  });

const loadPayments = (organizationId: string | null, range: FecPeriod, banks: ReadonlyMap<string, FecBankAccount>) =>
  dbTry("sales.fec.payments", () => getDrizzle().select({
    id: salesPayments.id, paidAt: salesPayments.paidAt, amountMinor: salesPayments.amountMinor, currency: salesPayments.currency, method: salesPayments.method,
    bankAccountId: salesPayments.bankAccountId, letteringCode: salesPayments.letteringCode, letteringDate: salesPayments.letteringDate,
    reference: salesPayments.reference, documentNumber: sales.number, customerName: sales.customerName, customerVatNumber: sales.customerVatNumber,
    ...frozenColumns,
  }).from(salesPayments).innerJoin(sales, eq(sales.id, salesPayments.documentId)).where(and(
    tenantOf(sales.organizationId, organizationId),
    gte(salesPayments.paidAt, range.start), lt(salesPayments.paidAt, range.endExclusive),
  )).orderBy(asc(salesPayments.paidAt), asc(salesPayments.id))).pipe(
    Effect.map((rows) => rows.map((row): FecPayment => ({
      id: row.id, paidAt: row.paidAt, amountMinor: row.amountMinor, currency: row.currency, method: row.method, reference: row.reference,
      documentNumber: row.documentNumber ?? row.id, customerName: row.customerName, customerVatNumber: row.customerVatNumber, fx: frozenOf(row),
      bankAccount: row.bankAccountId ? banks.get(row.bankAccountId) ?? null : null, lettering: letteringOf(row.letteringCode, row.letteringDate),
    }))),
  );


const loadPurchaseDocuments = (organizationId: string | null, range: FecPeriod) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const docs = yield* dbTry("purchasing.fec.docs", () => db.select().from(purchasingInvoices).where(and(
      tenantOf(purchasingInvoices.organizationId, organizationId),
      inArray(purchasingInvoices.kind, ["invoice", "credit_note"]),
      notInArray(purchasingInvoices.status, ["DRAFT", "CANCELLED"]),
      sql`${purchasingInvoices.number} is not null`,
      gte(purchasingInvoices.issueDate, range.start), lt(purchasingInvoices.issueDate, range.endExclusive),
    )).orderBy(asc(purchasingInvoices.issueDate), asc(purchasingInvoices.number)));
    const ids = docs.map((doc) => doc.id);
    const lines = ids.length === 0 ? [] : yield* dbTry("purchasing.fec.lines", () => db.select({
      invoiceId: purchasingInvoiceLines.invoiceId, netMinor: purchasingInvoiceLines.netMinor, ratePercent: purchasingInvoiceLines.ratePercent,
    }).from(purchasingInvoiceLines).where(inArray(purchasingInvoiceLines.invoiceId, ids)));
    const suppliers = docs.length === 0 ? [] : yield* dbTry("purchasing.fec.suppliers", () => db.select({
      id: purchasingSuppliers.id, name: purchasingSuppliers.name, vatNumber: purchasingSuppliers.vatNumber,
    }).from(purchasingSuppliers).where(inArray(purchasingSuppliers.id, [...new Set(docs.map((d) => d.supplierId))])));
    const bySupplier = new Map(suppliers.map((s) => [s.id, s]));
    const byDocument = Map.groupBy(lines, (line) => line.invoiceId);
    return docs.map((doc) => {
      const supplier = bySupplier.get(doc.supplierId);
      return {
        id: doc.id, kind: doc.kind as "invoice" | "credit_note", number: doc.number!, issueDate: doc.issueDate!, currency: doc.currency,
        customerName: supplier?.name ?? "", customerVatNumber: supplier?.vatNumber ?? null,
        supplierName: supplier?.name ?? "", supplierVatNumber: supplier?.vatNumber ?? null,
        netMinor: doc.netMinor, taxMinor: doc.taxMinor, grossMinor: doc.grossMinor,
        lines: (byDocument.get(doc.id) ?? []).map((line) => ({ netMinor: line.netMinor, ratePercent: String(line.ratePercent) })),
        fx: frozenOf(doc), lettering: letteringOf(doc.letteringCode, doc.letteringDate),
      };
    });
  });

const loadPurchasePayments = (organizationId: string | null, range: FecPeriod, banks: ReadonlyMap<string, FecBankAccount>) =>
  dbTry("purchasing.fec.payments", () => getDrizzle().select({
    id: purchasingPayments.id, paidAt: purchasingPayments.paidAt, amountMinor: purchasingPayments.amountMinor, currency: purchasingPayments.currency,
    method: purchasingPayments.method, reference: purchasingPayments.reference, documentNumber: purchasingInvoices.number,
    bankAccountId: purchasingPayments.bankAccountId, letteringCode: purchasingPayments.letteringCode, letteringDate: purchasingPayments.letteringDate,
    supplierId: purchasingInvoices.supplierId,
    ...purchaseFrozenColumns,
  }).from(purchasingPayments).innerJoin(purchasingInvoices, eq(purchasingInvoices.id, purchasingPayments.invoiceId)).where(and(
    tenantOf(purchasingInvoices.organizationId, organizationId),
    gte(purchasingPayments.paidAt, range.start), lt(purchasingPayments.paidAt, range.endExclusive),
  ))).pipe(Effect.flatMap((rows) => Effect.gen(function* () {
    const supplierIds = [...new Set(rows.map((r) => r.supplierId))];
    const suppliers = supplierIds.length === 0 ? [] : yield* dbTry("purchasing.fec.pay.suppliers", () => getDrizzle().select({
      id: purchasingSuppliers.id, name: purchasingSuppliers.name, vatNumber: purchasingSuppliers.vatNumber,
    }).from(purchasingSuppliers).where(inArray(purchasingSuppliers.id, supplierIds)));
    const bySupplier = new Map(suppliers.map((s) => [s.id, s]));
    return rows.map((row) => {
      const supplier = bySupplier.get(row.supplierId);
      return {
        id: row.id, paidAt: row.paidAt, amountMinor: row.amountMinor, currency: row.currency, method: row.method, reference: row.reference,
        documentNumber: row.documentNumber ?? row.id, supplierName: supplier?.name ?? "", supplierVatNumber: supplier?.vatNumber ?? null,
        fx: frozenOf(row), bankAccount: row.bankAccountId ? banks.get(row.bankAccountId) ?? null : null, lettering: letteringOf(row.letteringCode, row.letteringDate),
      };
    });
  })));

const errorText = (error: unknown): string => {
  const base = error instanceof Error ? error.message : String(error);
  const cause = (error as { cause?: unknown } | null)?.cause;
  const detail = cause instanceof Error && cause.message && !base.includes(cause.message) ? ` — ${cause.message}` : "";
  return `${base}${detail}`.slice(0, 1000);
};

/** Construit, encode et stocke le fichier ; met la ligne à `READY`. */
const produce = (exportId: string, organizationId: string | null, range: FecPeriod) =>
  Effect.gen(function* () {
    const profile = yield* dbTry("sales.fec.profile", () => getDrizzle().select({ legalId: salesSellerProfiles.legalId, legalIdScheme: salesSellerProfiles.legalIdScheme })
      .from(salesSellerProfiles).where(tenantOf(salesSellerProfiles.organizationId, organizationId)).limit(1)).pipe(Effect.map(([row]) => row ?? null));
    const siren = yield* fecSirenOf(profile);
    const chart = yield* accountingConfig(organizationId);
    const banks = yield* loadBankAccounts(organizationId);
    const documents = yield* loadDocuments(organizationId, range);
    const payments = yield* loadPayments(organizationId, range, banks);
    const purchaseDocuments = yield* loadPurchaseDocuments(organizationId, range);
    const purchasePayments = yield* loadPurchasePayments(organizationId, range, banks);
    const ledgerEntries = yield* loadLedgerEntries(organizationId, range);
    const { entries, summary } = yield* buildFecEntries({ period: range, documents, payments, purchaseDocuments, purchasePayments, chart, ledgerEntries });
    const file = yield* toFec(entries, { siren, closingDate: range.lastDay });
    const bytes = encodeLatin9(file.content);
    const storageKey = fecStorageKey(organizationId, range.period, file.filename);
    const storage = yield* PrivateStorage;
    yield* storage.put(storageKey, bytes, { contentType: FEC_CONTENT_TYPE, cacheControl: "private, no-store" });
    const [row] = yield* dbTry("sales.fec.ready", () => getDrizzle().update(salesFecExports).set({
      status: "READY", filename: file.filename, storageKey, sizeBytes: bytes.byteLength, sha256: sha256Hex(bytes), ...summary, error: null, generatedAt: sql`now()`,
    }).where(and(eq(salesFecExports.id, exportId), eq(salesFecExports.status, "PENDING"))).returning());
    return row!;
  });

export type FecGenerationResult =
  | { readonly status: "READY"; readonly export: FecExportRow }
  | { readonly status: "FAILED"; readonly exportId: string; readonly error: string }
  | { readonly status: "SKIPPED" };

export const fecExportService = {
  /**
   * Génère l'export (tenant, période). `force` relance immédiatement un échec (action manuelle) ;
   * sinon un échec attend `FEC_RETRY_AFTER_MINUTES`. Période invalide → `FecExportError`.
   */
  generate: (input: { readonly organizationId: string | null; readonly period: string; readonly authorId: string | null; readonly force?: boolean }) =>
    Effect.gen(function* () {
      const range = yield* parseFecPeriod(input.period);
      const exportId = yield* claim(input.organizationId, range.period, input.authorId, input.force ?? false);
      if (!exportId) return { status: "SKIPPED" } as FecGenerationResult;
      const outcome = yield* Effect.result(produce(exportId, input.organizationId, range));
      if (outcome._tag === "Success") return { status: "READY", export: outcome.success } as FecGenerationResult;
      const error = errorText(outcome.failure);
      yield* dbTry("sales.fec.failed", () => getDrizzle().update(salesFecExports).set({ status: "FAILED", error })
        .where(and(eq(salesFecExports.id, exportId), eq(salesFecExports.status, "PENDING"))));
      yield* Effect.logWarning("sales.fec: export en échec").pipe(Effect.annotateLogs({ exportId, organizationId: input.organizationId ?? "platform", period: range.period, error }));
      return { status: "FAILED", exportId, error } as FecGenerationResult;
    }),

  /**
   * Tâche du cron : exporte le mois précédent `now` pour chaque tenant ayant un profil vendeur ou
   * une pièce émise sur la période, hors exports prêts, en cours ou en échec récent ; au plus
   * `limit` tenants par appel (les suivants au prochain passage).
   */
  runMonthly: (now: Date, limit = FEC_CRON_BATCH) =>
    Effect.gen(function* () {
      const range = yield* parseFecPeriod(previousFecPeriod(now));
      const due = yield* dbTry("sales.fec.due", () => getDrizzle().execute<{ org: string | null }>(sql`
        SELECT t.org FROM (
          SELECT organization_id AS org FROM sales_seller_profiles
          UNION
          SELECT organization_id FROM sales_documents
           WHERE kind IN ('invoice', 'credit_note') AND number IS NOT NULL AND status NOT IN ('DRAFT', 'CANCELLED')
             AND issue_date >= ${range.start} AND issue_date < ${range.endExclusive}
        ) t
        LEFT JOIN sales_fec_exports e ON coalesce(e.organization_id, '') = coalesce(t.org, '') AND e.period = ${range.period}
        WHERE e.id IS NULL
           OR (e.status = 'FAILED' AND e.attempted_at < now() - make_interval(mins => ${FEC_RETRY_AFTER_MINUTES}))
           OR (e.status = 'PENDING' AND e.attempted_at < now() - make_interval(mins => ${FEC_STALE_PENDING_MINUTES}))
        ORDER BY t.org NULLS FIRST
        LIMIT ${limit}`)).pipe(Effect.map((result) => result.rows.map((row) => row.org)));
      const counts = { period: range.period, ready: 0, failed: 0, skipped: 0 };
      for (const organizationId of due) {
        const result = yield* fecExportService.generate({ organizationId, period: range.period, authorId: null });
        if (result.status === "READY") counts.ready += 1;
        else if (result.status === "FAILED") counts.failed += 1;
        else counts.skipped += 1;
      }
      return counts;
    }),
};

export const fecExportOf = (id: string) =>
  dbTry("sales.fec.get", () => getDrizzle().select().from(salesFecExports).where(eq(salesFecExports.id, id)).limit(1)).pipe(Effect.map(([row]) => row ?? null));

export const listFecExports = (input: { readonly organizationId?: string | null; readonly limit?: number; readonly offset?: number } = {}) =>
  dbTry("sales.fec.list", () => getDrizzle().select().from(salesFecExports)
    .where(input.organizationId === undefined ? undefined : tenantOf(salesFecExports.organizationId, input.organizationId))
    .orderBy(desc(salesFecExports.period), asc(salesFecExports.organizationId), desc(salesFecExports.createdAt), desc(salesFecExports.id))
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 200)).offset(Math.max(input.offset ?? 0, 0)));

/** Liste du back-office (tous tenants, RBAC global) : nom du tenant et de l'auteur (null = cron). */
export const listFecExportsForAdmin = (limit = 200) =>
  dbTry("sales.fec.adminList", () => getDrizzle().select({
    id: salesFecExports.id, organizationId: salesFecExports.organizationId, organizationName: organization.name, period: salesFecExports.period,
    status: salesFecExports.status, filename: salesFecExports.filename, sizeBytes: salesFecExports.sizeBytes, sha256: salesFecExports.sha256,
    entryCount: salesFecExports.entryCount, lineCount: salesFecExports.lineCount, debitMinor: salesFecExports.debitMinor, creditMinor: salesFecExports.creditMinor,
    error: salesFecExports.error, attempts: salesFecExports.attempts, generatedAt: salesFecExports.generatedAt, attemptedAt: salesFecExports.attemptedAt, generatedByName: user.name,
  }).from(salesFecExports)
    .leftJoin(organization, eq(organization.id, salesFecExports.organizationId))
    .leftJoin(user, eq(user.id, salesFecExports.generatedBy))
    .orderBy(desc(salesFecExports.period), sql`${organization.name} asc nulls first`, asc(salesFecExports.organizationId), desc(salesFecExports.id))
    .limit(Math.min(Math.max(limit, 1), 500)));

/** Adaptateur Promise (pages Astro). */
export const loadFecExportsForAdmin = (limit?: number) => runOrThrow(listFecExportsForAdmin(limit));
