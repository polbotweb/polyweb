/**
 * Génération d'un virement SEPA pain.001.001.03 (ISO 20022), sans dépendance.
 * Un fichier = un lot (un débiteur, N créanciers). Montants en unités mineures, devise EUR.
 */
import { Effect } from "effect";
import { toDecimalString } from "@/core/money";
import { escapeXml } from "@/core/einvoice/cii";
import { InvalidSepaPaymentError } from "./errors";
import { isValidBic, isValidIban, normalizeBic, normalizeIban } from "./iban";

export const PAIN_001_NS = "urn:iso:std:iso:20022:tech:xsd:pain.001.001.03";

export interface SepaParty {
  readonly name: string;
  readonly iban: string;
  readonly bic?: string | null;
}

export interface SepaCreditTransfer {
  /** Identifiant de bout en bout (max 35, unique dans le lot). */
  readonly endToEndId: string;
  readonly amountMinor: number;
  readonly currency: "EUR";
  readonly creditor: SepaParty;
  readonly remittance?: string | null;
}

export interface SepaCreditTransferInitiation {
  readonly messageId: string;
  readonly createdAt: Date;
  readonly requestedExecutionDate: string;
  readonly paymentInfoId: string;
  readonly debtor: SepaParty;
  readonly transfers: readonly SepaCreditTransfer[];
  readonly batchBooking?: boolean;
}

const el = (name: string, content: string, attrs: Record<string, string> = {}) => {
  const attributes = Object.entries(attrs).map(([key, value]) => ` ${key}="${escapeXml(value)}"`).join("");
  return `<${name}${attributes}>${content}</${name}>`;
};
const text = (name: string, value: string, attrs?: Record<string, string>) => el(name, escapeXml(value), attrs);

const NAME = /^[\p{L}\p{N} .,'()\-\/]{1,70}$/u;
const ID = /^[A-Za-z0-9_\-.:]{1,35}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const party = (value: SepaParty, label: string): Effect.Effect<SepaParty, InvalidSepaPaymentError> => {
  const name = value.name.trim();
  if (!NAME.test(name)) return Effect.fail(new InvalidSepaPaymentError({ field: `${label}.name`, value: value.name }));
  if (!isValidIban(value.iban)) return Effect.fail(new InvalidSepaPaymentError({ field: `${label}.iban`, value: value.iban }));
  const bic = value.bic?.trim() ? normalizeBic(value.bic) : null;
  if (bic && !isValidBic(bic)) return Effect.fail(new InvalidSepaPaymentError({ field: `${label}.bic`, value: value.bic ?? "" }));
  return Effect.succeed({ name, iban: normalizeIban(value.iban), bic });
};

const partyXml = (tag: string, acct: string, agt: string, value: SepaParty) =>
  el(tag, text("Nm", value.name))
  + el(acct, el("Id", text("IBAN", value.iban)))
  + (value.bic ? el(agt, el("FinInstnId", text("BIC", value.bic))) : "");

/** Construit le XML pain.001.001.03 (UTF-8), après validation du lot. */
export const renderPain001 = (input: SepaCreditTransferInitiation): Effect.Effect<string, InvalidSepaPaymentError> =>
  Effect.gen(function* () {
    if (!ID.test(input.messageId)) return yield* new InvalidSepaPaymentError({ field: "messageId", value: input.messageId });
    if (!ID.test(input.paymentInfoId)) return yield* new InvalidSepaPaymentError({ field: "paymentInfoId", value: input.paymentInfoId });
    if (!DATE.test(input.requestedExecutionDate) || Number.isNaN(Date.parse(input.requestedExecutionDate))) {
      return yield* new InvalidSepaPaymentError({ field: "requestedExecutionDate", value: input.requestedExecutionDate });
    }
    if (input.transfers.length === 0 || input.transfers.length > 10_000) {
      return yield* new InvalidSepaPaymentError({ field: "transfers", value: String(input.transfers.length) });
    }
    const debtor = yield* party(input.debtor, "debtor");
    const seen = new Set<string>();
    let ctrl = 0;
    const txs: string[] = [];
    for (const transfer of input.transfers) {
      if (!ID.test(transfer.endToEndId) || seen.has(transfer.endToEndId)) {
        return yield* new InvalidSepaPaymentError({ field: "endToEndId", value: transfer.endToEndId });
      }
      seen.add(transfer.endToEndId);
      if (transfer.currency !== "EUR") return yield* new InvalidSepaPaymentError({ field: "currency", value: transfer.currency });
      if (!Number.isSafeInteger(transfer.amountMinor) || transfer.amountMinor <= 0) {
        return yield* new InvalidSepaPaymentError({ field: "amountMinor", value: String(transfer.amountMinor) });
      }
      const creditor = yield* party(transfer.creditor, "creditor");
      const remittance = transfer.remittance?.trim().slice(0, 140) || null;
      ctrl += transfer.amountMinor;
      const amount = toDecimalString({ amountMinor: transfer.amountMinor, currency: "EUR" });
      txs.push(el("CdtTrfTxInf",
        el("PmtId", text("EndToEndId", transfer.endToEndId))
        + el("Amt", text("InstdAmt", amount, { Ccy: "EUR" }))
        + partyXml("Cdtr", "CdtrAcct", "CdtrAgt", creditor)
        + (remittance ? el("RmtInf", text("Ustrd", remittance)) : "")));
    }
    if (!Number.isSafeInteger(ctrl)) return yield* new InvalidSepaPaymentError({ field: "ctrlSum", value: String(ctrl) });
    const sum = toDecimalString({ amountMinor: ctrl, currency: "EUR" });
    const created = input.createdAt.toISOString().replace(/\.\d{3}Z$/, "Z");
    const count = String(input.transfers.length);
    const header = el("GrpHdr",
      text("MsgId", input.messageId)
      + text("CreDtTm", created)
      + text("NbOfTxs", count)
      + text("CtrlSum", sum)
      + el("InitgPty", text("Nm", debtor.name)));
    const payment = el("PmtInf",
      text("PmtInfId", input.paymentInfoId)
      + text("PmtMtd", "TRF")
      + text("BtchBookg", input.batchBooking === false ? "false" : "true")
      + text("NbOfTxs", count)
      + text("CtrlSum", sum)
      + el("PmtTpInf", el("SvcLvl", text("Cd", "SEPA")))
      + text("ReqdExctnDt", input.requestedExecutionDate)
      + partyXml("Dbtr", "DbtrAcct", "DbtrAgt", debtor)
      + text("ChrgBr", "SLEV")
      + txs.join(""));
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="${PAIN_001_NS}">`
      + el("CstmrCdtTrfInitn", header + payment)
      + "</Document>\n";
  });
