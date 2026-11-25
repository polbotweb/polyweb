/** Validation des comptes bancaires (pure) : IBAN / BIC (core/sepa), compte 512, journal, devise. */
import { Effect } from "effect";
import { ACCOUNT_CODE } from "@/core/accounting/chart";
import { isValidBic, isValidIban, normalizeIban } from "@/core/sepa/iban";
import { AUTOMATION_MODES, STATEMENT_FORMATS, type AutomationMode, type StatementFormat } from "./constants";
import { InvalidBankingSettingsError } from "./errors";
import { exponentOf } from "./parsers/values";

export interface BankAccountInput {
  readonly label: string;
  readonly iban: string | null;
  readonly bic: string | null;
  readonly accountNumber: string | null;
  readonly bankName: string | null;
  readonly currency: string;
  readonly ledgerAccount: string;
  readonly journalCode: string;
  readonly journalLabel: string;
  readonly openingBalanceMinor: number | null;
  readonly openingBalanceDate: string | null;
  readonly defaultFormat: StatementFormat | null;
  readonly csvProfileId: string | null;
  readonly automationMode: AutomationMode | null;
}

const JOURNAL = /^[A-Z0-9]{1,6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const bad = (field: string, value: unknown) => new InvalidBankingSettingsError({ field, value: String(value ?? "").slice(0, 40) });

export const validateBankAccount = (input: BankAccountInput): Effect.Effect<BankAccountInput, InvalidBankingSettingsError> =>
  Effect.gen(function* () {
    const label = input.label.trim();
    if (!label || label.length > 120) return yield* bad("label", input.label);
    const iban = input.iban?.trim() ? normalizeIban(input.iban) : null;
    if (iban && !isValidIban(iban)) return yield* bad("iban", "IBAN invalide");
    const bic = input.bic?.trim() ? input.bic.replace(/\s+/g, "").toUpperCase() : null;
    if (bic && !isValidBic(bic)) return yield* bad("bic", bic);
    const currency = input.currency.trim().toUpperCase();
    if (exponentOf(currency) === null) return yield* bad("currency", currency);
    const ledgerAccount = input.ledgerAccount.trim().toUpperCase();
    if (!ACCOUNT_CODE.test(ledgerAccount) || !ledgerAccount.startsWith("5")) return yield* bad("ledgerAccount", ledgerAccount);
    const journalCode = input.journalCode.trim().toUpperCase();
    if (!JOURNAL.test(journalCode)) return yield* bad("journalCode", journalCode);
    const journalLabel = input.journalLabel.trim();
    if (!journalLabel || journalLabel.length > 60) return yield* bad("journalLabel", journalLabel);
    if (input.openingBalanceMinor !== null && !Number.isSafeInteger(input.openingBalanceMinor)) return yield* bad("openingBalanceMinor", input.openingBalanceMinor);
    if (input.openingBalanceDate !== null && !DATE.test(input.openingBalanceDate)) return yield* bad("openingBalanceDate", input.openingBalanceDate);
    if (input.defaultFormat !== null && !(STATEMENT_FORMATS as readonly string[]).includes(input.defaultFormat)) return yield* bad("defaultFormat", input.defaultFormat);
    if (input.automationMode !== null && !(AUTOMATION_MODES as readonly string[]).includes(input.automationMode)) return yield* bad("automationMode", input.automationMode);
    const accountNumber = input.accountNumber?.replace(/\s+/g, "") || null;
    if (accountNumber && accountNumber.length > 34) return yield* bad("accountNumber", accountNumber);
    return { ...input, label, iban, bic, currency, ledgerAccount, journalCode, journalLabel, accountNumber, bankName: input.bankName?.trim().slice(0, 120) || null };
  });
