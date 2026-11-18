/**
 * core/accounting — plan de comptes, rôles comptables et journaux par organisation (pur).
 *
 * Les défauts reproduisent EXACTEMENT les constantes historiques de l'export FEC
 * (411000, 706000, 445710, 512000, 401000, 607000, 445660 ; journaux VE / HA / BQ) :
 * tant qu'une organisation ne modifie rien, ses écritures et son FEC sont inchangés.
 * Les comptes de rapprochement bancaire (frais, écarts, change, escompte, attente, virements
 * internes, avances) suivent le Plan comptable général français et restent modifiables.
 */
import { Data, Effect } from "effect";

export const ACCOUNT_KINDS = ["asset", "liability", "equity", "income", "expense"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/** Rôles : chaque usage comptable de l'application pointe vers un compte du plan. */
export const ACCOUNT_ROLES = [
  "receivable", "payable", "revenue", "expense", "vatCollected", "vatDeductible", "bank",
  "bankFees", "writeOffLoss", "writeOffGain", "fxLoss", "fxGain", "discountGiven", "discountReceived",
  "suspense", "internalTransfer", "customerAdvance", "supplierAdvance",
] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const JOURNAL_KINDS = ["sales", "purchases", "bank", "misc"] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];

export interface ChartAccount {
  readonly code: string;
  readonly label: string;
  readonly kind: AccountKind;
}

export interface Journal {
  readonly code: string;
  readonly label: string;
}

export interface AccountingConfig {
  /** Compte (numéro + libellé) de chaque rôle. */
  readonly roles: Readonly<Record<AccountRole, ChartAccount>>;
  readonly journals: Readonly<Record<JournalKind, Journal>>;
  /** Plan complet (défauts + comptes de l'organisation), trié par numéro. */
  readonly accounts: readonly ChartAccount[];
  /** Lettrage des comptes de tiers à l'export (FEC `EcritureLet` / `DateLet`). */
  readonly letteringEnabled: boolean;
}

/** Plan par défaut (PCG). Les 7 premiers sont les constantes historiques du FEC. */
export const DEFAULT_ROLE_ACCOUNTS: Readonly<Record<AccountRole, ChartAccount>> = {
  receivable: { code: "411000", label: "Clients", kind: "asset" },
  revenue: { code: "706000", label: "Prestations de services", kind: "income" },
  vatCollected: { code: "445710", label: "TVA collectée", kind: "liability" },
  bank: { code: "512000", label: "Banque", kind: "asset" },
  payable: { code: "401000", label: "Fournisseurs", kind: "liability" },
  expense: { code: "607000", label: "Achats de marchandises", kind: "expense" },
  vatDeductible: { code: "445660", label: "TVA déductible sur autres biens et services", kind: "asset" },
  bankFees: { code: "627000", label: "Services bancaires et assimilés", kind: "expense" },
  writeOffLoss: { code: "658000", label: "Charges diverses de gestion courante", kind: "expense" },
  writeOffGain: { code: "758000", label: "Produits divers de gestion courante", kind: "income" },
  fxLoss: { code: "666000", label: "Pertes de change", kind: "expense" },
  fxGain: { code: "766000", label: "Gains de change", kind: "income" },
  discountGiven: { code: "665000", label: "Escomptes accordés", kind: "expense" },
  discountReceived: { code: "765000", label: "Escomptes obtenus", kind: "income" },
  suspense: { code: "471000", label: "Compte d'attente", kind: "liability" },
  internalTransfer: { code: "580000", label: "Virements internes", kind: "asset" },
  customerAdvance: { code: "419100", label: "Clients - avances et acomptes reçus", kind: "liability" },
  supplierAdvance: { code: "409100", label: "Fournisseurs - avances et acomptes versés", kind: "asset" },
};

export const DEFAULT_JOURNALS: Readonly<Record<JournalKind, Journal>> = {
  sales: { code: "VE", label: "Ventes" },
  purchases: { code: "HA", label: "Achats" },
  bank: { code: "BQ", label: "Banque" },
  misc: { code: "OD", label: "Opérations diverses" },
};

/** Comptes usuels proposés en plus des rôles (affectations par règles de rapprochement). */
export const DEFAULT_EXTRA_ACCOUNTS: readonly ChartAccount[] = [
  { code: "445200", label: "TVA due intracommunautaire", kind: "liability" },
  { code: "455000", label: "Associés - comptes courants", kind: "liability" },
  { code: "601000", label: "Achats stockés - matières premières", kind: "expense" },
  { code: "604000", label: "Achats d'études et prestations de services", kind: "expense" },
  { code: "606100", label: "Fournitures non stockables (eau, énergie)", kind: "expense" },
  { code: "606400", label: "Fournitures administratives", kind: "expense" },
  { code: "613200", label: "Locations immobilières", kind: "expense" },
  { code: "616000", label: "Primes d'assurance", kind: "expense" },
  { code: "622600", label: "Honoraires", kind: "expense" },
  { code: "625100", label: "Voyages et déplacements", kind: "expense" },
  { code: "626000", label: "Frais postaux et de télécommunications", kind: "expense" },
  { code: "635100", label: "Impôts directs (sauf impôts sur les bénéfices)", kind: "expense" },
  { code: "641000", label: "Rémunérations du personnel", kind: "expense" },
  { code: "645000", label: "Charges de sécurité sociale et de prévoyance", kind: "expense" },
  { code: "661600", label: "Intérêts bancaires et sur opérations de financement", kind: "expense" },
  { code: "764000", label: "Revenus des valeurs mobilières de placement", kind: "income" },
  { code: "768000", label: "Autres produits financiers", kind: "income" },
];

export const DEFAULT_ACCOUNTING_CONFIG: AccountingConfig = {
  roles: DEFAULT_ROLE_ACCOUNTS,
  journals: DEFAULT_JOURNALS,
  accounts: sortAccounts([...Object.values(DEFAULT_ROLE_ACCOUNTS), ...DEFAULT_EXTRA_ACCOUNTS]),
  letteringEnabled: true,
};

function sortAccounts(accounts: readonly ChartAccount[]): ChartAccount[] {
  const byCode = new Map<string, ChartAccount>();
  for (const account of accounts) byCode.set(account.code, account);
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export class InvalidAccountingConfigError extends Data.TaggedError("InvalidAccountingConfigError")<{ readonly field: string; readonly value: string }> {
  override get message() {
    return `Paramétrage comptable invalide (${this.field}) : ${this.value}`;
  }
}

/** Numéro de compte : 3 à 20 caractères alphanumériques, commençant par un chiffre de classe 1 à 8. */
export const ACCOUNT_CODE = /^[1-8][0-9A-Z]{2,19}$/;
/** Code journal FEC : 1 à 10 caractères alphanumériques. */
export const JOURNAL_CODE = /^[A-Z0-9]{1,10}$/;

const cleanLabel = (label: string) => label.replace(/[\t\r\n|]/g, " ").replace(/\s+/g, " ").trim();

export const validateAccount = (account: ChartAccount): Effect.Effect<ChartAccount, InvalidAccountingConfigError> => {
  const code = account.code.trim().toUpperCase();
  const label = cleanLabel(account.label);
  if (!ACCOUNT_CODE.test(code)) return Effect.fail(new InvalidAccountingConfigError({ field: "code", value: account.code }));
  if (!label || label.length > 120) return Effect.fail(new InvalidAccountingConfigError({ field: "label", value: account.label }));
  if (!(ACCOUNT_KINDS as readonly string[]).includes(account.kind)) return Effect.fail(new InvalidAccountingConfigError({ field: "kind", value: account.kind }));
  return Effect.succeed({ code, label, kind: account.kind });
};

export const validateJournal = (journal: Journal): Effect.Effect<Journal, InvalidAccountingConfigError> => {
  const code = journal.code.trim().toUpperCase();
  const label = cleanLabel(journal.label);
  if (!JOURNAL_CODE.test(code)) return Effect.fail(new InvalidAccountingConfigError({ field: "journal", value: journal.code }));
  if (!label || label.length > 60) return Effect.fail(new InvalidAccountingConfigError({ field: "journalLabel", value: journal.label }));
  return Effect.succeed({ code, label });
};

/**
 * Configuration effective : plan par défaut + comptes de l'organisation (qui priment à numéro
 * égal), rôles surchargés (code → compte du plan), journaux surchargés.
 */
export const resolveAccountingConfig = (input: {
  readonly accounts: readonly (ChartAccount & { readonly active?: boolean })[];
  readonly roleCodes: Partial<Record<AccountRole, string>>;
  readonly journals: Partial<Record<JournalKind, Journal>>;
  readonly letteringEnabled?: boolean;
}): AccountingConfig => {
  const active = input.accounts.filter((account) => account.active !== false);
  const accounts = sortAccounts([...DEFAULT_ACCOUNTING_CONFIG.accounts, ...active.map(({ code, label, kind }) => ({ code, label, kind }))]);
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  const roles = Object.fromEntries(ACCOUNT_ROLES.map((role) => {
    const code = input.roleCodes[role];
    return [role, (code && byCode.get(code)) || byCode.get(DEFAULT_ROLE_ACCOUNTS[role].code) || DEFAULT_ROLE_ACCOUNTS[role]];
  })) as Record<AccountRole, ChartAccount>;
  const journals = Object.fromEntries(JOURNAL_KINDS.map((kind) => [kind, input.journals[kind] ?? DEFAULT_JOURNALS[kind]])) as Record<JournalKind, Journal>;
  return { roles, journals, accounts, letteringEnabled: input.letteringEnabled ?? true };
};

/** Valide les surcharges de rôles (compte existant dans le plan) et de journaux (codes uniques). */
export const validateAccountingSettings = (
  input: { readonly roleCodes: Partial<Record<AccountRole, string>>; readonly journals: Partial<Record<JournalKind, Journal>> },
  accounts: readonly ChartAccount[],
): Effect.Effect<{ roleCodes: Partial<Record<AccountRole, string>>; journals: Partial<Record<JournalKind, Journal>> }, InvalidAccountingConfigError> =>
  Effect.gen(function* () {
    const known = new Set(accounts.map((account) => account.code));
    const roleCodes: Partial<Record<AccountRole, string>> = {};
    for (const [role, raw] of Object.entries(input.roleCodes)) {
      if (!(ACCOUNT_ROLES as readonly string[]).includes(role)) return yield* new InvalidAccountingConfigError({ field: "role", value: role });
      const code = (raw ?? "").trim().toUpperCase();
      if (!code) continue;
      if (!known.has(code)) return yield* new InvalidAccountingConfigError({ field: role, value: code });
      roleCodes[role as AccountRole] = code;
    }
    const journals: Partial<Record<JournalKind, Journal>> = {};
    const codes = new Set<string>();
    for (const kind of JOURNAL_KINDS) {
      const journal = input.journals[kind];
      if (!journal) continue;
      const valid = yield* validateJournal(journal);
      if (codes.has(valid.code)) return yield* new InvalidAccountingConfigError({ field: "journal", value: valid.code });
      codes.add(valid.code);
      journals[kind] = valid;
    }
    return { roleCodes, journals };
  });

// ── Lettrage ────────────────────────────────────────────────────────────────

/**
 * Code de lettrage à partir d'un rang (1 → `AA`, 26 → `AZ`, 27 → `BA`, 676 → `ZZ`, 677 → `AAA`…) :
 * deux lettres au minimum, comme l'usage des logiciels comptables français.
 */
export const letteringCode = (value: number): string => {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`rang de lettrage invalide : ${value}`);
  let width = 2;
  let offset = value - 1;
  while (offset >= 26 ** width) { offset -= 26 ** width; width += 1; }
  let out = "";
  for (let index = 0; index < width; index++) {
    out = String.fromCharCode(65 + (offset % 26)) + out;
    offset = Math.floor(offset / 26);
  }
  return out;
};
