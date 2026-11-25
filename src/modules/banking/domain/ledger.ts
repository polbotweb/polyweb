/**
 * Grand livre banque (B9–B11), pur : écritures des opérations propres à la banque — frais,
 * passages en perte ou profit, escomptes, écarts de change réalisés, trop-perçus, virements
 * internes, opérations par règle, frais de versement Stripe — toujours équilibrées (débit = crédit),
 * en EUR (devise de tenue), avec la contre-valeur en devise sur la ligne de banque.
 *
 * Convention : un ajustement porte son **effet sur la banque** (`bankEffectMinor`, signé : > 0 la
 * banque reçoit plus que les pièces, < 0 elle reçoit moins / paie plus). L'écriture débite (> 0) ou
 * crédite (< 0) la banque et passe la contrepartie sur le compte du rôle concerné.
 */
import type { AccountingConfig, AccountRole, ChartAccount } from "@/core/accounting/chart";
import type { AdjustmentKind, LedgerKind, OverpaymentTreatment } from "./constants";

export interface BankLedgerAccount {
  readonly account: string;
  readonly accountLabel: string;
  readonly journalCode: string;
  readonly journalLabel: string;
}

export interface LedgerLineDraft {
  readonly account: string;
  readonly accountLabel: string;
  readonly auxAccount: string | null;
  readonly auxLabel: string | null;
  readonly label: string;
  readonly debitMinor: number;
  readonly creditMinor: number;
  readonly foreignMinor: number | null;
  readonly foreignCurrency: string | null;
  readonly lettering: string | null;
}

export interface LedgerEntryDraft {
  readonly kind: LedgerKind;
  readonly date: string;
  readonly journalCode: string;
  readonly journalLabel: string;
  readonly pieceRef: string;
  readonly label: string;
  readonly lines: readonly LedgerLineDraft[];
}

export interface Counterpart {
  readonly account: ChartAccount;
  readonly auxAccount?: string | null;
  readonly auxLabel?: string | null;
  /** Part positive de la contrepartie (EUR, unités mineures). */
  readonly amountMinor: number;
  readonly label?: string;
  readonly lettering?: string | null;
}

export interface Adjustment {
  readonly kind: AdjustmentKind;
  /** Effet sur la banque dans la devise du mouvement (signé). */
  readonly bankEffectMinor: number;
  /** Tiers (avance client / fournisseur). */
  readonly auxAccount?: string | null;
  readonly auxLabel?: string | null;
}

const clean = (label: string) => label.replace(/[\t\r\n|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || "Banque";

const line = (input: Partial<LedgerLineDraft> & Pick<LedgerLineDraft, "account" | "accountLabel" | "label">): LedgerLineDraft => ({
  auxAccount: null, auxLabel: null, debitMinor: 0, creditMinor: 0, foreignMinor: null, foreignCurrency: null, lettering: null, ...input,
});

/** Somme des débits = somme des crédits, montants entiers positifs, au moins deux lignes. */
export const isBalancedEntry = (entry: Pick<LedgerEntryDraft, "lines">): boolean => {
  if (entry.lines.length < 2) return false;
  let debit = 0;
  let credit = 0;
  for (const l of entry.lines) {
    if (!Number.isSafeInteger(l.debitMinor) || !Number.isSafeInteger(l.creditMinor) || l.debitMinor < 0 || l.creditMinor < 0) return false;
    if (l.debitMinor > 0 && l.creditMinor > 0) return false;
    debit += l.debitMinor;
    credit += l.creditMinor;
  }
  return debit === credit && debit > 0;
};

/**
 * Fusionne les lignes d'un même compte (et tiers, lettrage) en une ligne nette ; supprime les
 * lignes nulles. Ex. : compte d'encaissement carte = compte banque → seule la commission reste.
 */
export const netLines = (lines: readonly LedgerLineDraft[]): LedgerLineDraft[] => {
  const groups = new Map<string, { base: LedgerLineDraft; net: number; foreign: number; hasForeign: boolean }>();
  for (const l of lines) {
    const key = [l.account, l.auxAccount ?? "", l.lettering ?? "", l.foreignCurrency ?? ""].join("|");
    const group = groups.get(key) ?? { base: l, net: 0, foreign: 0, hasForeign: false };
    group.net += l.debitMinor - l.creditMinor;
    if (l.foreignMinor !== null) { group.foreign += l.foreignMinor; group.hasForeign = true; }
    groups.set(key, group);
  }
  return [...groups.values()].filter((g) => g.net !== 0).map((g) => ({
    ...g.base, debitMinor: g.net > 0 ? g.net : 0, creditMinor: g.net < 0 ? -g.net : 0,
    foreignMinor: g.hasForeign ? Math.abs(g.foreign) : null, foreignCurrency: g.hasForeign ? g.base.foreignCurrency : null,
  }));
};

/**
 * Écriture d'un mouvement de banque contre une ou plusieurs contreparties :
 * effet > 0 → débit banque / crédit contreparties ; effet < 0 → crédit banque / débit contreparties.
 */
export const bankEntry = (input: {
  readonly kind: LedgerKind;
  readonly bank: BankLedgerAccount;
  readonly date: string;
  readonly pieceRef: string;
  readonly label: string;
  /** Effet EUR sur la banque (signé). */
  readonly bankEffectMinor: number;
  readonly counterparts: readonly Counterpart[];
  /** Contre-valeur dans la devise du compte (si ≠ EUR). */
  readonly foreign?: { readonly amountMinor: number; readonly currency: string } | null;
  readonly bankLettering?: string | null;
}): LedgerEntryDraft => {
  const label = clean(input.label);
  const abs = Math.abs(input.bankEffectMinor);
  const inflow = input.bankEffectMinor > 0;
  const bankLine = line({
    account: input.bank.account, accountLabel: input.bank.accountLabel, label,
    debitMinor: inflow ? abs : 0, creditMinor: inflow ? 0 : abs,
    foreignMinor: input.foreign && input.foreign.currency !== "EUR" ? Math.abs(input.foreign.amountMinor) : null,
    foreignCurrency: input.foreign && input.foreign.currency !== "EUR" ? input.foreign.currency : null,
    lettering: input.bankLettering ?? null,
  });
  const counter = input.counterparts.map((c) => line({
    account: c.account.code, accountLabel: c.account.label, auxAccount: c.auxAccount ?? null, auxLabel: c.auxLabel ?? null,
    label: clean(c.label ?? label), debitMinor: inflow ? 0 : c.amountMinor, creditMinor: inflow ? c.amountMinor : 0, lettering: c.lettering ?? null,
  }));
  return { kind: input.kind, date: input.date, journalCode: input.bank.journalCode, journalLabel: input.bank.journalLabel, pieceRef: clean(input.pieceRef).slice(0, 60), label, lines: netLines([bankLine, ...counter]) };
};

/** Ventilation TTC → HT + TVA (arrondi au plus proche, exact sur le total). */
export const splitVat = (grossMinor: number, ratePercent: string | null): { readonly netMinor: number; readonly vatMinor: number } => {
  if (!ratePercent || Number(ratePercent) === 0) return { netMinor: grossMinor, vatMinor: 0 };
  const [int = "0", frac = ""] = ratePercent.split(".");
  const scale = 10 ** frac.length;
  const rate = BigInt(int + frac);
  const gross = BigInt(Math.abs(grossMinor));
  const denominator = BigInt(100 * scale) + rate;
  const vat = (gross * rate * 2n + denominator) / (denominator * 2n);
  const sign = grossMinor < 0 ? -1 : 1;
  return { netMinor: sign * Number(gross - vat), vatMinor: sign * Number(vat) };
};

/** Rôle comptable de la contrepartie d'un ajustement selon son sens. */
export const adjustmentRole = (adjustment: Pick<Adjustment, "kind" | "bankEffectMinor">, treatment: OverpaymentTreatment): AccountRole => {
  const gain = adjustment.bankEffectMinor > 0;
  switch (adjustment.kind) {
    case "fee": return "bankFees";
    case "write_off": return gain ? "writeOffGain" : "writeOffLoss";
    case "discount": return gain ? "discountReceived" : "discountGiven";
    case "fx": return gain ? "fxGain" : "fxLoss";
    case "overpayment":
      if (treatment === "advance") return gain ? "customerAdvance" : "supplierAdvance";
      return "suspense";
  }
};

export interface AdjustmentInEur extends Adjustment {
  /** Effet EUR (signé) ; égal à `bankEffectMinor` pour un compte en EUR. */
  readonly bankEffectEurMinor: number;
}

/** Écriture des ajustements d'un rapprochement (une écriture, plusieurs lignes) ; `null` si rien. */
export const adjustmentsEntry = (input: {
  readonly bank: BankLedgerAccount;
  readonly date: string;
  readonly pieceRef: string;
  readonly label: string;
  readonly currency: string;
  readonly adjustments: readonly AdjustmentInEur[];
  readonly config: AccountingConfig;
  readonly treatment: OverpaymentTreatment;
  readonly lettering: string | null;
}): LedgerEntryDraft | null => {
  const effective = input.adjustments.filter((a) => a.bankEffectEurMinor !== 0);
  if (effective.length === 0) return null;
  const lines: LedgerLineDraft[] = [];
  for (const adjustment of effective) {
    const role = adjustmentRole(adjustment, input.treatment);
    const account = input.config.roles[role];
    const usesAux = role === "customerAdvance" || role === "supplierAdvance";
    const entry = bankEntry({
      kind: adjustment.kind, bank: input.bank, date: input.date, pieceRef: input.pieceRef, label: `${input.label} — ${account.label}`,
      bankEffectMinor: adjustment.bankEffectEurMinor,
      counterparts: [{ account, amountMinor: Math.abs(adjustment.bankEffectEurMinor), auxAccount: usesAux ? adjustment.auxAccount ?? null : null, auxLabel: usesAux ? adjustment.auxLabel ?? null : null, lettering: usesAux ? input.lettering : null }],
      foreign: input.currency !== "EUR" ? { amountMinor: adjustment.bankEffectMinor, currency: input.currency } : null,
    });
    lines.push(...entry.lines);
  }
  const kinds = new Set(effective.map((a) => a.kind));
  const kind: LedgerKind = kinds.size === 1 ? [...kinds][0]! : "manual";
  return { kind, date: input.date, journalCode: input.bank.journalCode, journalLabel: input.bank.journalLabel, pieceRef: clean(input.pieceRef).slice(0, 60), label: clean(input.label), lines: netLines(lines) };
};

/** Écriture d'une opération classée par règle (charge / produit avec TVA éventuelle). */
export const ruleEntry = (input: {
  readonly bank: BankLedgerAccount;
  readonly date: string;
  readonly pieceRef: string;
  readonly label: string;
  readonly amountEurMinor: number;
  readonly foreign: { readonly amountMinor: number; readonly currency: string } | null;
  readonly account: ChartAccount;
  readonly vatRate: string | null;
  readonly config: AccountingConfig;
  readonly kind: "rule" | "fee";
  readonly auxAccount?: string | null;
  readonly auxLabel?: string | null;
}): LedgerEntryDraft => {
  const { netMinor, vatMinor } = splitVat(Math.abs(input.amountEurMinor), input.vatRate);
  const vatAccount = input.amountEurMinor < 0 ? input.config.roles.vatDeductible : input.config.roles.vatCollected;
  return bankEntry({
    kind: input.kind, bank: input.bank, date: input.date, pieceRef: input.pieceRef, label: input.label, bankEffectMinor: input.amountEurMinor, foreign: input.foreign,
    counterparts: [
      { account: input.account, amountMinor: netMinor, auxAccount: input.auxAccount ?? null, auxLabel: input.auxLabel ?? null },
      ...(vatMinor > 0 ? [{ account: vatAccount, amountMinor: vatMinor }] : []),
    ],
  });
};

/** Virement interne : une écriture par compte, contrepartie « virements internes » lettrée des deux côtés. */
export const transferEntries = (input: {
  readonly from: BankLedgerAccount & { readonly amountEurMinor: number; readonly foreign: { readonly amountMinor: number; readonly currency: string } | null; readonly date: string };
  readonly to: BankLedgerAccount & { readonly amountEurMinor: number; readonly foreign: { readonly amountMinor: number; readonly currency: string } | null; readonly date: string };
  readonly pieceRef: string;
  readonly label: string;
  readonly config: AccountingConfig;
  readonly lettering: string | null;
}): LedgerEntryDraft[] => {
  const transit = input.config.roles.internalTransfer;
  const out = bankEntry({
    kind: "transfer", bank: input.from, date: input.from.date, pieceRef: input.pieceRef, label: input.label, bankEffectMinor: -Math.abs(input.from.amountEurMinor),
    foreign: input.from.foreign, counterparts: [{ account: transit, amountMinor: Math.abs(input.from.amountEurMinor), lettering: input.lettering }],
  });
  const incoming = bankEntry({
    kind: "transfer", bank: input.to, date: input.to.date, pieceRef: input.pieceRef, label: input.label, bankEffectMinor: Math.abs(input.to.amountEurMinor),
    foreign: input.to.foreign, counterparts: [{ account: transit, amountMinor: Math.abs(input.to.amountEurMinor), lettering: input.lettering }],
  });
  // Écart de contre-valeur entre les deux comptes (devises différentes) : change réalisé sur le transit.
  const gap = Math.abs(input.to.amountEurMinor) - Math.abs(input.from.amountEurMinor);
  if (gap === 0) return [out, incoming];
  const fxAccount = gap > 0 ? input.config.roles.fxGain : input.config.roles.fxLoss;
  const fx: LedgerEntryDraft = {
    kind: "fx", date: input.to.date, journalCode: input.to.journalCode, journalLabel: input.to.journalLabel, pieceRef: clean(input.pieceRef).slice(0, 60), label: clean(`${input.label} — ${fxAccount.label}`),
    lines: [
      line({ account: transit.code, accountLabel: transit.label, label: clean(input.label), debitMinor: gap > 0 ? gap : 0, creditMinor: gap < 0 ? -gap : 0, lettering: input.lettering }),
      line({ account: fxAccount.code, accountLabel: fxAccount.label, label: clean(input.label), debitMinor: gap < 0 ? -gap : 0, creditMinor: gap > 0 ? gap : 0 }),
    ],
  };
  return [out, incoming, fx];
};

/** Versement Stripe (payout) : banque (net) + commissions = compte d'encaissement carte (brut − remboursements). */
export const payoutEntry = (input: {
  readonly bank: BankLedgerAccount;
  readonly date: string;
  readonly pieceRef: string;
  readonly label: string;
  readonly netEurMinor: number;
  readonly feeEurMinor: number;
  readonly config: AccountingConfig;
}): LedgerEntryDraft => {
  const clearing = input.config.roles.paymentClearing;
  const fees = input.config.roles.bankFees;
  const label = clean(input.label);
  const lines = netLines([
    line({ account: input.bank.account, accountLabel: input.bank.accountLabel, label, debitMinor: Math.max(0, input.netEurMinor), creditMinor: Math.max(0, -input.netEurMinor) }),
    line({ account: fees.code, accountLabel: fees.label, label, debitMinor: Math.max(0, input.feeEurMinor), creditMinor: Math.max(0, -input.feeEurMinor) }),
    line({ account: clearing.code, accountLabel: clearing.label, label, debitMinor: Math.max(0, -(input.netEurMinor + input.feeEurMinor)), creditMinor: Math.max(0, input.netEurMinor + input.feeEurMinor) }),
  ]);
  return { kind: "payout_fee", date: input.date, journalCode: input.bank.journalCode, journalLabel: input.bank.journalLabel, pieceRef: clean(input.pieceRef).slice(0, 60), label, lines };
};

/** Contrepassation : mêmes lignes, débit et crédit inversés, lettrage retiré. */
export const reversalEntry = (entry: Pick<LedgerEntryDraft, "journalCode" | "journalLabel" | "pieceRef" | "label" | "lines">, date: string): LedgerEntryDraft => ({
  kind: "reversal", date, journalCode: entry.journalCode, journalLabel: entry.journalLabel, pieceRef: entry.pieceRef, label: clean(`Annulation — ${entry.label}`),
  lines: entry.lines.map((l) => ({ ...l, debitMinor: l.creditMinor, creditMinor: l.debitMinor, lettering: null })),
});

/**
 * Ajustements automatiques d'un écart `deltaMinor` = |mouvement| − pièces (devise du mouvement) :
 * sous la tolérance → perte / profit ; trop-perçu au-delà → traitement réglé ; manque au-delà →
 * aucun (règlement partiel, le reste dû est conservé). Renvoie les ajustements et le reste non soldé.
 */
export const autoAdjustments = (input: {
  readonly direction: "in" | "out";
  readonly deltaMinor: number;
  readonly writeOffToleranceMinor: number;
  readonly auxAccount?: string | null;
  readonly auxLabel?: string | null;
}): { readonly adjustments: Adjustment[]; readonly partial: boolean } => {
  const { direction, deltaMinor } = input;
  if (deltaMinor === 0) return { adjustments: [], partial: false };
  // Effet banque : encaissement trop élevé (+) / trop faible (−) ; décaissement trop élevé (−) / trop faible (+).
  const bankEffect = direction === "in" ? deltaMinor : -deltaMinor;
  if (Math.abs(deltaMinor) <= input.writeOffToleranceMinor) return { adjustments: [{ kind: "write_off", bankEffectMinor: bankEffect }], partial: false };
  if (deltaMinor > 0) return { adjustments: [{ kind: "overpayment", bankEffectMinor: bankEffect, auxAccount: input.auxAccount ?? null, auxLabel: input.auxLabel ?? null }], partial: false };
  return { adjustments: [], partial: true };
};
