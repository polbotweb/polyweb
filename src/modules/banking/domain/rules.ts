/**
 * Moteur de règles de rapprochement par organisation (B7), pur : conditions sans expression
 * régulière libre (aucun ReDoS possible), évaluées dans l'ordre ; la première règle active qui
 * correspond s'applique. Actions : écriture sur un compte (avec TVA éventuelle), frais bancaires,
 * virement interne, ou ignorer ; validation automatique ou simple proposition.
 */
import { Effect } from "effect";
import { ACCOUNT_CODE } from "@/core/accounting/chart";
import { normalizeIban, normalizeReference } from "@/core/reconciliation/normalize";
import { LABEL_OPERATORS, RULE_ACTIONS, RULE_DIRECTIONS, type LabelOperator, type RuleAction, type RuleDirection } from "./constants";
import { InvalidBankRuleError } from "./errors";

export interface RuleConditions {
  /** Compte bancaire visé (null = tous). */
  readonly bankAccountId: string | null;
  readonly direction: RuleDirection;
  /** Bornes sur la valeur absolue (unités mineures), incluses. */
  readonly amountMinMinor: number | null;
  readonly amountMaxMinor: number | null;
  readonly label: { readonly operator: LabelOperator; readonly value: string } | null;
  readonly counterpartyIban: string | null;
  /** Le nom de la contrepartie contient (insensible à la casse et aux accents). */
  readonly counterpartyName: string | null;
  /** Code opération (BTC ISO, CFONB, SWIFT) : égalité ou préfixe. */
  readonly bankCode: string | null;
}

export interface RuleActions {
  readonly kind: RuleAction;
  /** Compte du plan (action `ledger`), sinon rôle par défaut (`fee` → frais bancaires). */
  readonly accountCode: string | null;
  /** Taux de TVA (%, chaîne décimale) ventilé sur la contrepartie ; null = pas de TVA. */
  readonly vatRate: string | null;
  readonly label: string | null;
  /** Compte auxiliaire / tiers porté sur la contrepartie (lettrage). */
  readonly auxAccount: string | null;
  readonly auxLabel: string | null;
  /** Compte bancaire de destination (action `transfer`). */
  readonly targetBankAccountId: string | null;
  /** Valider sans intervention (sinon : proposition à confirmer). */
  readonly autoValidate: boolean;
}

export interface BankRule {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly active: boolean;
  readonly conditions: RuleConditions;
  readonly actions: RuleActions;
}

export interface RuleLine {
  readonly bankAccountId: string;
  readonly amountMinor: number;
  readonly label: string;
  readonly counterpartyName: string | null;
  readonly counterpartyIban: string | null;
  readonly bankCode: string | null;
}

const fold = (value: string | null | undefined) => (value ?? "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/\s+/g, " ").trim();

export const labelMatches = (label: string, condition: NonNullable<RuleConditions["label"]>): boolean => {
  const haystack = fold(label);
  const needle = fold(condition.value);
  if (!needle) return false;
  switch (condition.operator) {
    case "contains": return haystack.includes(needle);
    case "starts_with": return haystack.startsWith(needle);
    case "ends_with": return haystack.endsWith(needle);
    case "equals": return haystack === needle;
  }
};

export const ruleMatches = (rule: Pick<BankRule, "active" | "conditions">, line: RuleLine): boolean => {
  if (!rule.active) return false;
  const c = rule.conditions;
  if (c.bankAccountId && c.bankAccountId !== line.bankAccountId) return false;
  if (c.direction === "in" && line.amountMinor <= 0) return false;
  if (c.direction === "out" && line.amountMinor >= 0) return false;
  const abs = Math.abs(line.amountMinor);
  if (c.amountMinMinor !== null && abs < c.amountMinMinor) return false;
  if (c.amountMaxMinor !== null && abs > c.amountMaxMinor) return false;
  if (c.label && !labelMatches(line.label, c.label)) return false;
  if (c.counterpartyIban && normalizeIban(c.counterpartyIban) !== normalizeIban(line.counterpartyIban)) return false;
  if (c.counterpartyName && !fold(line.counterpartyName ?? line.label).includes(fold(c.counterpartyName))) return false;
  if (c.bankCode) {
    const code = normalizeReference(line.bankCode);
    const wanted = normalizeReference(c.bankCode);
    if (!code || !code.startsWith(wanted)) return false;
  }
  return true;
};

/** Première règle active (ordre croissant de position, puis id) qui correspond. */
export const firstMatchingRule = <R extends BankRule>(rules: readonly R[], line: RuleLine): R | null =>
  [...rules].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).find((rule) => ruleMatches(rule, line)) ?? null;

const VAT = /^\d{1,2}(\.\d{1,3})?$/;

export const validateRule = (input: Omit<BankRule, "id"> & { readonly id?: string }): Effect.Effect<Omit<BankRule, "id">, InvalidBankRuleError> =>
  Effect.gen(function* () {
    const name = input.name.replace(/\s+/g, " ").trim();
    if (!name || name.length > 120) return yield* new InvalidBankRuleError({ field: "name", value: input.name });
    if (!Number.isInteger(input.position) || input.position < 0 || input.position > 100_000) return yield* new InvalidBankRuleError({ field: "position", value: String(input.position) });
    const c = input.conditions;
    if (!(RULE_DIRECTIONS as readonly string[]).includes(c.direction)) return yield* new InvalidBankRuleError({ field: "direction", value: c.direction });
    for (const [field, value] of [["amountMinMinor", c.amountMinMinor], ["amountMaxMinor", c.amountMaxMinor]] as const) {
      if (value !== null && (!Number.isSafeInteger(value) || value < 0)) return yield* new InvalidBankRuleError({ field, value: String(value) });
    }
    if (c.amountMinMinor !== null && c.amountMaxMinor !== null && c.amountMinMinor > c.amountMaxMinor) return yield* new InvalidBankRuleError({ field: "amountMaxMinor", value: String(c.amountMaxMinor) });
    if (c.label && (!(LABEL_OPERATORS as readonly string[]).includes(c.label.operator) || !c.label.value.trim() || c.label.value.length > 200)) return yield* new InvalidBankRuleError({ field: "label", value: c.label.value });
    const hasCondition = !!(c.label || c.counterpartyIban || c.counterpartyName || c.bankCode || c.amountMinMinor !== null || c.amountMaxMinor !== null);
    if (!hasCondition) return yield* new InvalidBankRuleError({ field: "conditions", value: "au moins un critère (libellé, contrepartie, code ou montant)" });
    const a = input.actions;
    if (!(RULE_ACTIONS as readonly string[]).includes(a.kind)) return yield* new InvalidBankRuleError({ field: "kind", value: a.kind });
    if (a.kind === "ledger" && (!a.accountCode || !ACCOUNT_CODE.test(a.accountCode.toUpperCase()))) return yield* new InvalidBankRuleError({ field: "accountCode", value: a.accountCode ?? "" });
    if (a.accountCode && !ACCOUNT_CODE.test(a.accountCode.toUpperCase())) return yield* new InvalidBankRuleError({ field: "accountCode", value: a.accountCode });
    if (a.vatRate !== null && (!VAT.test(a.vatRate) || Number(a.vatRate) >= 100)) return yield* new InvalidBankRuleError({ field: "vatRate", value: a.vatRate });
    if (a.kind === "transfer" && !a.targetBankAccountId) return yield* new InvalidBankRuleError({ field: "targetBankAccountId", value: "" });
    if (a.label && a.label.length > 200) return yield* new InvalidBankRuleError({ field: "label", value: a.label.slice(0, 20) });
    return {
      name, position: input.position, active: input.active,
      conditions: { ...c, label: c.label ? { operator: c.label.operator, value: c.label.value.trim() } : null, counterpartyIban: c.counterpartyIban ? normalizeIban(c.counterpartyIban) : null, counterpartyName: c.counterpartyName?.trim() || null, bankCode: c.bankCode?.trim() || null },
      actions: { ...a, accountCode: a.accountCode ? a.accountCode.toUpperCase() : null, label: a.label?.trim() || null, auxAccount: a.auxAccount?.trim().toUpperCase() || null, auxLabel: a.auxLabel?.trim() || null },
    };
  });

/** Suggestion de règle à partir d'un rapprochement manuel (« créer une règle à partir de ce choix »). */
export const ruleFromLine = (line: RuleLine, actions: RuleActions): Omit<BankRule, "id"> => {
  const words = fold(line.label).split(" ").filter((word) => word.length >= 3 && !/^\d+$/.test(word)).slice(0, 3).join(" ");
  return {
    name: (line.counterpartyName ?? words) || "Règle",
    position: 100,
    active: true,
    conditions: {
      bankAccountId: line.bankAccountId, direction: line.amountMinor >= 0 ? "in" : "out", amountMinMinor: null, amountMaxMinor: null,
      label: line.counterpartyIban || !words ? null : { operator: "contains", value: words },
      counterpartyIban: line.counterpartyIban, counterpartyName: null, bankCode: null,
    },
    actions,
  };
};
