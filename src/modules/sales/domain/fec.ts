/**
 * Export FEC mensuel (pur) : période, écritures du mois (journal des ventes VE, journal de banque BQ),
 * tri chronologique et numérotation continue, encodage ISO 8859-15 (art. A47 A-1 du LPF).
 *
 * - VE : une écriture par facture / avoir émis dans le mois (411 TTC ; 706 HT et 44571 TVA par taux,
 *   `buildSaleEntry`) ; les totaux recalculés depuis les lignes doivent égaler les totaux enregistrés.
 * - BQ : une écriture par encaissement (512 / 411) ou remboursement (sens inversé) daté du mois.
 * - Tri : date d'écriture, journal (VE avant BQ), référence de pièce, identifiant (déterministe) ;
 *   `EcritureNum` = `<journal><AAAAMM><seq:5>`, continu par journal dans la période.
 * - Devise de tenue EUR : une pièce en devise étrangère est comptabilisée à sa contre-valeur figée
 *   à l'émission (core/fx, colonnes `*_base_minor`), le montant d'origine en `Montantdevise` /
 *   `Idevise`. Lignes par taux converties au taux figé puis ajustées (plus grosse ligne) pour égaler
 *   exactement les totaux figés. Un règlement en devise est valorisé au taux figé de sa pièce
 *   (pas d'écart de change 666/766 à ce stade). Sans contre-valeur EUR figée → échec explicite.
 */
import { createHash } from "node:crypto";
import { Data, Effect } from "effect";
import { computeTaxTotals, type CurrencyCode, type Money, type TaxTotals } from "@/core/money";
import { convertAt, parseRate } from "@/core/fx";
import { assertBalanced, buildSaleEntry, type AccountingExportError, type JournalEntry, type UnbalancedEntryError } from "@/modules/tax/domain/accounting";
import { isValidSiren } from "./seller-profile";

export class FecExportError extends Data.TaggedError("FecExportError")<{
  readonly reason: "period" | "siren" | "currency" | "totals" | "encoding";
  readonly detail: string;
}> {
  override get message() {
    return `Export FEC impossible (${this.reason}) : ${this.detail}`;
  }
}

// ── Période ────────────────────────────────────────────────────────────────

export interface FecPeriod {
  /** `AAAA-MM`. */
  readonly period: string;
  /** Premier jour (inclus), AAAA-MM-JJ. */
  readonly start: string;
  /** Premier jour du mois suivant (exclu), AAAA-MM-JJ. */
  readonly endExclusive: string;
  /** Dernier jour du mois (date de clôture portée par le nom de fichier), AAAA-MM-JJ. */
  readonly lastDay: string;
}

const pad = (value: number, size = 2) => String(value).padStart(size, "0");
const isoDay = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

export const parseFecPeriod = (period: string): Effect.Effect<FecPeriod, FecExportError> => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) return Effect.fail(new FecExportError({ reason: "period", detail: period }));
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000 || year > 9999) return Effect.fail(new FecExportError({ reason: "period", detail: period }));
  const start = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month, 0));
  return Effect.succeed({ period, start: isoDay(start), endExclusive: isoDay(next), lastDay: isoDay(last) });
};

/** Mois civil précédent `now` (UTC) : période exportée par le cron. */
export const previousFecPeriod = (now: Date): string => {
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${previous.getUTCFullYear()}-${pad(previous.getUTCMonth() + 1)}`;
};

/** Une période est exportable une fois close : strictement antérieure au mois de `now` (UTC). */
export const isClosedFecPeriod = (period: string, now: Date): boolean => period <= previousFecPeriod(now);

// ── SIREN ──────────────────────────────────────────────────────────────────

/** SIREN du vendeur : schéma ISO 6523 `0002` (SIREN) ou `0009` (SIRET, 9 premiers chiffres), clé Luhn valide. */
export const fecSirenOf = (profile: { readonly legalId: string | null; readonly legalIdScheme: string | null } | null): Effect.Effect<string, FecExportError> => {
  const id = (profile?.legalId ?? "").replace(/\s+/g, "");
  const scheme = profile?.legalIdScheme ?? "";
  const siren = scheme === "0002" ? id : scheme === "0009" && /^\d{14}$/.test(id) ? id.slice(0, 9) : "";
  return isValidSiren(siren) ? Effect.succeed(siren) : Effect.fail(new FecExportError({ reason: "siren", detail: profile ? `${scheme || "?"}:${id || "?"}` : "profil vendeur absent" }));
};

// ── Écritures ──────────────────────────────────────────────────────────────

export interface FecDocumentLine {
  readonly netMinor: number;
  readonly ratePercent: string;
}

export interface FecDocument {
  readonly id: string;
  readonly kind: "invoice" | "credit_note";
  readonly number: string;
  readonly issueDate: string;
  readonly currency: string;
  readonly customerName: string;
  readonly customerVatNumber: string | null;
  readonly netMinor: number;
  readonly taxMinor: number;
  readonly grossMinor: number;
  readonly lines: readonly FecDocumentLine[];
  /** Contre-valeur figée à l'émission (null pour une pièce en EUR antérieure au multi-devise). */
  readonly fx?: FecFrozen | null;
}

export interface FecFrozen {
  readonly baseCurrency: string;
  readonly exchangeRate: string;
  readonly netBaseMinor: number;
  readonly taxBaseMinor: number;
  readonly grossBaseMinor: number;
}

export interface FecPayment {
  readonly id: string;
  readonly paidAt: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly method: string;
  readonly reference: string | null;
  readonly documentNumber: string;
  readonly customerName: string;
  readonly customerVatNumber: string | null;
  /** Taux figé de la pièce réglée (règlement en devise étrangère). */
  readonly fx?: FecFrozen | null;
}

export const FEC_ACCOUNTS = { receivable: "411000", revenue: "706000", vat: "445710", bank: "512000" } as const;
export const FEC_JOURNALS = { sales: { code: "VE", label: "Ventes" }, bank: { code: "BQ", label: "Banque" } } as const;

/** Taux normalisé pour les libellés (`20.0000` → `20`, `5.5000` → `5.5`). */
export const normalizeRate = (rate: string) => {
  const [int = "0", frac = ""] = rate.trim().split(".");
  const trimmed = frac.replace(/0+$/, "");
  return `${String(Number(int))}${trimmed ? `.${trimmed}` : ""}`;
};

/** Compte client auxiliaire stable (FEC : `CompAuxNum`) : `C` + 10 hex de SHA-256(nom normalisé | n° TVA). */
export const customerAuxAccount = (name: string, vatNumber: string | null) =>
  `C${createHash("sha256").update(`${name.trim().toLowerCase().replace(/\s+/g, " ")}|${(vatNumber ?? "").replace(/\s+/g, "").toUpperCase()}`).digest("hex").slice(0, 10).toUpperCase()}`;

const money = (amountMinor: number, currency: CurrencyCode = "EUR"): Money => ({ amountMinor, currency });

const frozenOf = (fx: FecFrozen | null | undefined, what: string) =>
  fx && fx.baseCurrency === "EUR" ? parseRate(fx.exchangeRate).pipe(Effect.mapError(() => new FecExportError({ reason: "currency", detail: `${what} : taux figé invalide` })))
    : Effect.fail(new FecExportError({ reason: "currency", detail: `${what} : aucune contre-valeur EUR figée` }));

/** Ajuste la plus grosse ligne pour que la somme égale exactement `target` (écart d'arrondi). */
const reconcile = (amounts: readonly number[], target: number) => {
  const out = [...amounts];
  if (out.length === 0) return out;
  let largest = 0;
  out.forEach((value, index) => { if (Math.abs(value) > Math.abs(out[largest]!)) largest = index; });
  out[largest] = out[largest]! + target - out.reduce((sum, value) => sum + value, 0);
  return out;
};

/** Totaux par taux en EUR (contre-valeur figée), conformes aux totaux figés du document. */
const toBaseTotals = (totals: TaxTotals, frozen: FecFrozen | null | undefined, what: string) =>
  Effect.gen(function* () {
    const rate = yield* frozenOf(frozen, what);
    const fx = frozen!;
    const convert = (value: Money) => convertAt(value, "EUR", rate, "half-up").pipe(Effect.map((m) => m.amountMinor), Effect.mapError(() => new FecExportError({ reason: "currency", detail: `${what} : conversion impossible` })));
    const bases = reconcile(yield* Effect.forEach(totals.byRate, (row) => convert(row.base)), fx.netBaseMinor);
    const taxes = reconcile(yield* Effect.forEach(totals.byRate, (row) => convert(row.tax)), fx.taxBaseMinor);
    return {
      ...totals,
      net: money(fx.netBaseMinor), tax: money(fx.taxBaseMinor), gross: money(fx.netBaseMinor + fx.taxBaseMinor),
      byRate: totals.byRate.map((row, index) => ({ ...row, base: money(bases[index]!), tax: money(taxes[index]!) })),
    } as TaxTotals;
  });

/** Ajoute le montant d'origine (`foreign`) aux lignes d'une écriture convertie, dans le même ordre que les totaux d'origine. */
const withForeign = (entry: JournalEntry, original: TaxTotals): JournalEntry => {
  const amounts = [
    original.gross,
    ...original.byRate.filter((row) => row.base.amountMinor !== 0).map((row) => row.base),
    ...original.byRate.filter((row) => row.tax.amountMinor !== 0).map((row) => row.tax),
  ];
  return { ...entry, lines: entry.lines.map((line, index) => (amounts[index] ? { ...line, foreign: amounts[index] } : line)) };
};

interface Draft {
  readonly journal: "VE" | "BQ";
  readonly date: string;
  readonly pieceRef: string;
  readonly sortId: string;
  readonly entry: (entryNumber: string) => Effect.Effect<JournalEntry, UnbalancedEntryError | AccountingExportError>;
}

const JOURNAL_ORDER = { VE: 0, BQ: 1 } as const;

/** Ordre total déterministe des écritures (date, journal, pièce, identifiant). */
export const compareFecEntries = (a: Pick<Draft, "journal" | "date" | "pieceRef" | "sortId">, b: Pick<Draft, "journal" | "date" | "pieceRef" | "sortId">) =>
  a.date.localeCompare(b.date) || JOURNAL_ORDER[a.journal] - JOURNAL_ORDER[b.journal] || a.pieceRef.localeCompare(b.pieceRef) || a.sortId.localeCompare(b.sortId);

export interface FecSummary {
  readonly entryCount: number;
  readonly lineCount: number;
  readonly debitMinor: number;
  readonly creditMinor: number;
}

/** Écritures VE + BQ de la période, triées, numérotées et toutes vérifiées équilibrées. */
export const buildFecEntries = (input: { readonly period: FecPeriod; readonly documents: readonly FecDocument[]; readonly payments: readonly FecPayment[] }) =>
  Effect.gen(function* () {
    const inPeriod = (date: string) => date >= input.period.start && date < input.period.endExclusive;
    const drafts: Draft[] = [];
    for (const doc of input.documents) {
      if (!inPeriod(doc.issueDate)) continue;
      const currency = doc.currency as CurrencyCode;
      const totals = yield* computeTaxTotals(doc.lines.map((line) => ({ net: money(line.netMinor, currency), ratePercent: normalizeRate(line.ratePercent) })), { currency });
      if (totals.net.amountMinor !== doc.netMinor || totals.tax.amountMinor !== doc.taxMinor || totals.gross.amountMinor !== doc.grossMinor) {
        return yield* Effect.fail(new FecExportError({ reason: "totals", detail: `${doc.number} : lignes ${totals.net.amountMinor}/${totals.tax.amountMinor}/${totals.gross.amountMinor} ≠ document ${doc.netMinor}/${doc.taxMinor}/${doc.grossMinor}` }));
      }
      const foreign = currency !== "EUR";
      const booked = foreign ? yield* toBaseTotals(totals, doc.fx, `${doc.number} en ${currency}`) : totals;
      drafts.push({
        journal: "VE", date: doc.issueDate, pieceRef: doc.number, sortId: doc.id,
        entry: (entryNumber) => buildSaleEntry({
          entryNumber, date: doc.issueDate, pieceRef: doc.number, customerAccount: customerAuxAccount(doc.customerName, doc.customerVatNumber), customerName: doc.customerName,
          totals: booked, creditNote: doc.kind === "credit_note", journalCode: FEC_JOURNALS.sales.code, journalLabel: FEC_JOURNALS.sales.label,
          accounts: { receivable: FEC_ACCOUNTS.receivable, revenue: FEC_ACCOUNTS.revenue, vat: FEC_ACCOUNTS.vat },
        }).pipe(Effect.map((entry) => (foreign ? withForeign(entry, totals) : entry))),
      });
    }
    for (const payment of input.payments) {
      if (!inPeriod(payment.paidAt) || payment.amountMinor === 0) continue;
      const refund = payment.amountMinor < 0;
      const original = money(Math.abs(payment.amountMinor), payment.currency as CurrencyCode);
      const amount = payment.currency === "EUR" ? original
        : yield* frozenOf(payment.fx, `règlement ${payment.documentNumber} en ${payment.currency}`).pipe(
          Effect.flatMap((rate) => convertAt(original, "EUR", rate, "half-up").pipe(Effect.mapError(() => new FecExportError({ reason: "currency", detail: `règlement ${payment.documentNumber} : conversion impossible` })))),
        );
      const foreign = payment.currency === "EUR" ? {} : { foreign: original };
      const none = money(0);
      const label = `${refund ? "Remboursement" : "Règlement"} ${payment.documentNumber} ${payment.customerName}`;
      const aux = customerAuxAccount(payment.customerName, payment.customerVatNumber);
      drafts.push({
        journal: "BQ", date: payment.paidAt, pieceRef: payment.reference?.trim() || payment.documentNumber, sortId: payment.id,
        entry: (entryNumber) => assertBalanced({
          journalCode: FEC_JOURNALS.bank.code, journalLabel: FEC_JOURNALS.bank.label, entryNumber, entryDate: payment.paidAt,
          pieceRef: payment.reference?.trim() || payment.documentNumber, pieceDate: payment.paidAt,
          lines: [
            { account: FEC_ACCOUNTS.bank, accountLabel: "Banque", label, debit: refund ? none : amount, credit: refund ? amount : none, ...foreign },
            { account: FEC_ACCOUNTS.receivable, accountLabel: "Clients", auxAccount: aux, auxLabel: payment.customerName, label, debit: refund ? amount : none, credit: refund ? none : amount, ...foreign },
          ],
        }),
      });
    }
    drafts.sort(compareFecEntries);
    const sequence = { VE: 0, BQ: 0 };
    const compact = input.period.period.replace("-", "");
    const entries: JournalEntry[] = [];
    for (const draft of drafts) {
      sequence[draft.journal] += 1;
      entries.push(yield* draft.entry(`${draft.journal}${compact}${pad(sequence[draft.journal], 5)}`));
    }
    const lines = entries.flatMap((entry) => entry.lines);
    const summary: FecSummary = {
      entryCount: entries.length,
      lineCount: lines.length,
      debitMinor: lines.reduce((sum, line) => sum + line.debit.amountMinor, 0),
      creditMinor: lines.reduce((sum, line) => sum + line.credit.amountMinor, 0),
    };
    return { entries, summary };
  });

// ── Encodage ───────────────────────────────────────────────────────────────

/** Différences ISO 8859-15 / Latin-1 (les autres points de code < 0x100 sont identiques). */
const LATIN9_SPECIAL: Record<string, number> = { "€": 0xa4, "Š": 0xa6, "š": 0xa8, "Ž": 0xb4, "ž": 0xb8, "Œ": 0xbc, "œ": 0xbd, "Ÿ": 0xbe };
const LATIN1_REPLACED = new Set([0xa4, 0xa6, 0xa8, 0xb4, 0xb8, 0xbc, 0xbd, 0xbe]);

/** Caractère hors ISO 8859-15 → forme sans diacritique si elle existe, sinon `?` (jamais d'octet invalide). */
const latin9Byte = (char: string): number[] => {
  const special = LATIN9_SPECIAL[char];
  if (special !== undefined) return [special];
  const code = char.codePointAt(0)!;
  if (code < 0x100 && !LATIN1_REPLACED.has(code) && (code >= 0x20 || code === 0x0d || code === 0x0a)) return [code];
  const base = char.normalize("NFD").replace(/\p{M}/gu, "");
  if (base && base !== char) return [...base].flatMap(latin9Byte);
  return [0x3f];
};

export const encodeLatin9 = (text: string): Uint8Array => Uint8Array.from([...text].flatMap(latin9Byte));

/** Décodage ISO 8859-15 (contrôle et tests). */
export const decodeLatin9 = (bytes: Uint8Array): string => {
  const reverse = new Map(Object.entries(LATIN9_SPECIAL).map(([char, byte]) => [byte, char]));
  return [...bytes].map((byte) => reverse.get(byte) ?? String.fromCharCode(byte)).join("");
};

export const FEC_CONTENT_TYPE = "text/plain; charset=ISO-8859-15";

/** Clé de stockage privée d'un export : `fec/<organisation|platform>/<AAAA-MM>/<fichier>`. */
export const fecStorageKey = (organizationId: string | null, period: string, filename: string) =>
  `fec/${organizationId ? organizationId.replace(/[^a-zA-Z0-9._-]/g, "_") : "platform"}/${period}/${filename}`;

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
