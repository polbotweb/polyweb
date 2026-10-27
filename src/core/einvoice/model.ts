/**
 * Modèle de facture électronique neutre (EN 16931), indépendant des modules métier.
 * Montants en unités mineures (`core/money`), quantités et taux en décimaux texte.
 * Les identifiants `BT-n` renvoient aux termes métier de la norme EN 16931-1.
 */
import type { CurrencyCode } from "@/core/money";

/** UNTDID 1001 : 380 facture commerciale, 381 avoir. */
export type EInvoiceTypeCode = "380" | "381";

/** UNCL 5305 : S standard, Z taux zéro, E exonéré, AE autoliquidation, K intracom., G export, O hors champ. */
export const VAT_CATEGORY_CODES = ["S", "Z", "E", "AE", "K", "G", "O"] as const;
export type VatCategoryCode = (typeof VAT_CATEGORY_CODES)[number];

export interface EInvoiceAddress {
  readonly line1?: string | null;
  readonly line2?: string | null;
  readonly postcode?: string | null;
  readonly city?: string | null;
  /** ISO 3166-1 alpha-2 (BT-40 / BT-55). */
  readonly country: string;
}

export interface EInvoiceParty {
  /** BT-27 / BT-44. */
  readonly name: string;
  /** N° de TVA (BT-31 / BT-48). */
  readonly vatId?: string | null;
  /** Identifiant légal (BT-30 / BT-47), ex. SIREN avec le schéma ISO 6523 `0002`. */
  readonly legalId?: { readonly value: string; readonly scheme?: string | null } | null;
  readonly address: EInvoiceAddress;
  /** Adresse électronique (BT-34 / BT-49, schéma `EM`). */
  readonly email?: string | null;
}

export interface EInvoiceLine {
  /** BT-126. */
  readonly id: string;
  /** BT-153. */
  readonly name: string;
  /** BT-129, décimal positif (« 2 », « 1.5 »). */
  readonly quantity: string;
  /** UN/ECE Rec. 20 (BT-130), défaut `C62` (unité). */
  readonly unitCode?: string;
  /** Prix unitaire net HT (BT-146), unités mineures. */
  readonly unitPriceMinor: number;
  /** Remise de ligne (BT-136), unités mineures. */
  readonly allowanceMinor?: number;
  /** Net HT de la ligne (BT-131) = arrondi(prix × quantité) − remise. */
  readonly netMinor: number;
  readonly vatCategory: VatCategoryCode;
  /** BT-152, décimal (« 20 », « 5.5 »). */
  readonly vatRatePercent: string;
}

export interface EInvoice {
  readonly typeCode: EInvoiceTypeCode;
  /** BT-1. */
  readonly number: string;
  /** BT-2, AAAA-MM-JJ. */
  readonly issueDate: string;
  /** BT-5. */
  readonly currency: CurrencyCode;
  readonly seller: EInvoiceParty;
  readonly buyer: EInvoiceParty;
  readonly lines: readonly EInvoiceLine[];
  /** BT-9, AAAA-MM-JJ. */
  readonly dueDate?: string | null;
  /** BT-20. */
  readonly paymentTerms?: string | null;
  /** Virement (UNTDID 4461 `30` / `58` SEPA) vers l'IBAN du vendeur (BT-84). */
  readonly payeeIban?: string | null;
  /** BT-83 (référence de paiement). */
  readonly paymentReference?: string | null;
  /** BT-22 (notes, ex. mention légale). */
  readonly notes?: readonly string[];
  /** BT-120 / BT-121 : motif d'exonération par catégorie (E, AE, K, G, O). */
  readonly exemptionReasons?: Partial<Record<VatCategoryCode, { readonly text?: string | null; readonly code?: string | null }>>;
  /** BT-25 / BT-26 : facture d'origine (avoir). */
  readonly precedingInvoice?: { readonly number: string; readonly issueDate?: string | null } | null;
}

export interface EInvoiceVatBreakdown {
  readonly category: VatCategoryCode;
  readonly ratePercent: string;
  readonly baseMinor: number;
  readonly taxMinor: number;
}

export interface EInvoiceTotals {
  /** BT-106. */
  readonly lineTotalMinor: number;
  /** BT-109. */
  readonly taxBasisMinor: number;
  /** BT-110. */
  readonly taxMinor: number;
  /** BT-112. */
  readonly grandTotalMinor: number;
  /** BT-115. */
  readonly duePayableMinor: number;
  readonly vat: readonly EInvoiceVatBreakdown[];
}
