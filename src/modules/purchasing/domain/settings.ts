/**
 * Réglages d'achats par organisation : tout ce qui peut varier selon le métier
 * est configurable, avec des défauts sûrs (prêt-à-porter sur mesure).
 */
import { Effect } from "effect";
import { isValidBic, isValidIban } from "@/core/sepa";
import { InvalidPurchaseOrderError } from "./errors";

export const REORDER_MODES = ["off", "suggestions", "auto_draft", "auto_send"] as const;
export type ReorderMode = (typeof REORDER_MODES)[number];

export const MATCHING_MODES = ["two_way", "three_way"] as const;
export type MatchingMode = (typeof MATCHING_MODES)[number];

export const MATCHING_POLICIES = ["block", "allow_with_acceptance"] as const;
export type MatchingPolicy = (typeof MATCHING_POLICIES)[number];

export const EMAIL_TEMPLATE_PURPOSES = ["po_send", "po_reminder", "return_notice"] as const;
export type EmailTemplatePurpose = (typeof EMAIL_TEMPLATE_PURPOSES)[number];

export interface PurchasingSettings {
  readonly reorderMode: ReorderMode;
  /** Heure locale 0–23 à laquelle le cron calcule les suggestions / brouillons. */
  readonly reorderHour: number;
  readonly reorderIncludeReservations: boolean;
  /** L'envoi automatique n'est possible que si ce drapeau est vrai et le fournisseur est « catalogue de confiance ». */
  readonly reorderAutoSendTrustedOnly: boolean;
  readonly matchingMode: MatchingMode;
  readonly toleranceAbsoluteMinor: number;
  /** Pourcentage 0–100 (ex. 1 = 1 %). */
  readonly tolerancePercent: number;
  readonly matchingPolicy: MatchingPolicy;
  readonly defaultTaxCategory: string;
  readonly defaultPaymentTermDays: number;
  readonly defaultCurrency: string;
  readonly qualityControlRequired: boolean;
  readonly allowServiceLines: boolean;
  readonly allowMultiWarehouse: boolean;
  readonly poPrefix: string;
  readonly receiptPrefix: string;
  readonly invoicePrefix: string;
  readonly creditPrefix: string;
  readonly returnPrefix: string;
  readonly sepaPrefix: string;
  /** Identité du débiteur pour les lots SEPA (optionnel jusqu'à l'export). */
  readonly debtorName: string | null;
  readonly debtorIban: string | null;
  readonly debtorBic: string | null;
}

export const DEFAULT_PURCHASING_SETTINGS: PurchasingSettings = {
  reorderMode: "suggestions",
  reorderHour: 6,
  reorderIncludeReservations: false,
  reorderAutoSendTrustedOnly: true,
  matchingMode: "three_way",
  toleranceAbsoluteMinor: 100,
  tolerancePercent: 1,
  matchingPolicy: "allow_with_acceptance",
  defaultTaxCategory: "standard",
  defaultPaymentTermDays: 30,
  defaultCurrency: "EUR",
  qualityControlRequired: false,
  allowServiceLines: true,
  allowMultiWarehouse: true,
  poPrefix: "BC",
  receiptPrefix: "BR",
  invoicePrefix: "FF",
  creditPrefix: "AF",
  returnPrefix: "RF",
  sepaPrefix: "SEPA",
  debtorName: null,
  debtorIban: null,
  debtorBic: null,
};

const PREFIX = /^[A-Z][A-Z0-9]{0,7}$/;

export const validatePurchasingSettings = (input: PurchasingSettings) =>
  Effect.gen(function* () {
    if (!(REORDER_MODES as readonly string[]).includes(input.reorderMode)) {
      return yield* new InvalidPurchaseOrderError({ field: "reorderMode", value: input.reorderMode });
    }
    if (!Number.isInteger(input.reorderHour) || input.reorderHour < 0 || input.reorderHour > 23) {
      return yield* new InvalidPurchaseOrderError({ field: "reorderHour", value: String(input.reorderHour) });
    }
    if (!(MATCHING_MODES as readonly string[]).includes(input.matchingMode)) {
      return yield* new InvalidPurchaseOrderError({ field: "matchingMode", value: input.matchingMode });
    }
    if (!(MATCHING_POLICIES as readonly string[]).includes(input.matchingPolicy)) {
      return yield* new InvalidPurchaseOrderError({ field: "matchingPolicy", value: input.matchingPolicy });
    }
    if (!Number.isSafeInteger(input.toleranceAbsoluteMinor) || input.toleranceAbsoluteMinor < 0) {
      return yield* new InvalidPurchaseOrderError({ field: "toleranceAbsoluteMinor", value: String(input.toleranceAbsoluteMinor) });
    }
    if (!Number.isFinite(input.tolerancePercent) || input.tolerancePercent < 0 || input.tolerancePercent > 100) {
      return yield* new InvalidPurchaseOrderError({ field: "tolerancePercent", value: String(input.tolerancePercent) });
    }
    if (!Number.isSafeInteger(input.defaultPaymentTermDays) || input.defaultPaymentTermDays < 0 || input.defaultPaymentTermDays > 365) {
      return yield* new InvalidPurchaseOrderError({ field: "defaultPaymentTermDays", value: String(input.defaultPaymentTermDays) });
    }
    if (!/^[A-Z]{3}$/.test(input.defaultCurrency)) {
      return yield* new InvalidPurchaseOrderError({ field: "defaultCurrency", value: input.defaultCurrency });
    }
    for (const [field, value] of [
      ["poPrefix", input.poPrefix], ["receiptPrefix", input.receiptPrefix], ["invoicePrefix", input.invoicePrefix],
      ["creditPrefix", input.creditPrefix], ["returnPrefix", input.returnPrefix], ["sepaPrefix", input.sepaPrefix],
    ] as const) {
      if (!PREFIX.test(value)) return yield* new InvalidPurchaseOrderError({ field, value });
    }
    if (input.debtorIban && !isValidIban(input.debtorIban)) {
      return yield* new InvalidPurchaseOrderError({ field: "debtorIban", value: input.debtorIban });
    }
    if (input.debtorBic && !isValidBic(input.debtorBic)) {
      return yield* new InvalidPurchaseOrderError({ field: "debtorBic", value: input.debtorBic });
    }
    return input;
  });

/** L'envoi automatique n'est autorisé que si le mode l'est, le catalogue est de confiance, et le réglage l'exige. */
export const canAutoSend = (settings: PurchasingSettings, supplierTrustedCatalogue: boolean) =>
  settings.reorderMode === "auto_send" && (!settings.reorderAutoSendTrustedOnly || supplierTrustedCatalogue);
