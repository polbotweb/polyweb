/**
 * Règles de détermination de la TVA (pures, sans I/O) : régime applicable selon le pays
 * du vendeur et de l'acheteur, le type de client (B2B / B2C), le n° de TVA et la nature
 * de l'opération (biens / services). Le taux est ensuite résolu dans la table des taux
 * (`rates.ts`) pour le pays d'imposition et la catégorie du produit.
 *
 * Références : directive 2006/112/CE (art. 44, 138, 196), CGI art. 262 ter I, 283-2, 262 I ;
 * régime OSS (vente à distance B2C intra-UE au-delà du seuil de 10 000 €).
 */
import { Data, Effect } from "effect";

export const EU_COUNTRIES = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"] as const;
export type EuCountry = (typeof EU_COUNTRIES)[number];
export const isEuCountry = (country: string): country is EuCountry => (EU_COUNTRIES as readonly string[]).includes(country);

export const TAX_CATEGORIES = ["standard", "reduced", "reduced-2", "super-reduced", "zero", "exempt"] as const;
export type TaxCategory = (typeof TAX_CATEGORIES)[number];

export const CUSTOMER_TYPES = ["B2B", "B2C"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const SUPPLY_TYPES = ["goods", "services"] as const;
export type SupplyType = (typeof SUPPLY_TYPES)[number];

/**
 * Régimes :
 * - `domestic` : vente nationale, TVA du pays du vendeur ;
 * - `intra-eu-b2c-origin` : B2C intra-UE sous le seuil OSS, TVA du pays du vendeur ;
 * - `intra-eu-b2c-destination` : B2C intra-UE avec OSS, TVA du pays de l'acheteur ;
 * - `intra-eu-reverse-charge` : B2B intra-UE avec n° de TVA valide, autoliquidation (0 %) ;
 * - `export` : acheteur hors UE, exonération (0 %).
 */
export const TAX_TREATMENTS = ["domestic", "intra-eu-b2c-origin", "intra-eu-b2c-destination", "intra-eu-reverse-charge", "export"] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

export interface TaxContext {
  readonly sellerCountry: string;
  readonly buyerCountry: string;
  readonly customerType: CustomerType;
  /** N° de TVA intracommunautaire de l'acheteur (B2B). */
  readonly buyerVatNumber?: string | null;
  readonly supplyType: SupplyType;
  /** Vendeur inscrit au guichet unique OSS (ou seuil de 10 000 € dépassé). */
  readonly ossRegistered?: boolean;
}

export interface TaxDetermination {
  readonly treatment: TaxTreatment;
  /** Pays dont le taux s'applique (null si 0 % de plein droit : autoliquidation / export). */
  readonly taxCountry: string | null;
  /** La TVA est-elle facturée par le vendeur ? */
  readonly charged: boolean;
  /** Mention légale obligatoire sur la facture (clé i18n, voir `legalMention`). */
  readonly mention: TaxMention | null;
}

export type TaxMention = "reverse-charge-services" | "intra-eu-goods-exempt" | "export-exempt";

export class InvalidTaxContextError extends Data.TaggedError("InvalidTaxContextError")<{ readonly field: "sellerCountry" | "buyerCountry" | "buyerVatNumber"; readonly value: string }> {
  override get message() {
    return `Contexte fiscal invalide (${this.field}) : ${this.value}`;
  }
}

/** Formats de n° de TVA UE (contrôle syntaxique ; la validité VIES relève d'un service externe). */
const VAT_PATTERNS: Record<EuCountry, RegExp> = {
  AT: /^ATU\d{8}$/, BE: /^BE[01]\d{9}$/, BG: /^BG\d{9,10}$/, CY: /^CY\d{8}[A-Z]$/, CZ: /^CZ\d{8,10}$/, DE: /^DE\d{9}$/,
  DK: /^DK\d{8}$/, EE: /^EE\d{9}$/, ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/, FI: /^FI\d{8}$/, FR: /^FR[A-HJ-NP-Z0-9]{2}\d{9}$/,
  GR: /^EL\d{9}$/, HR: /^HR\d{11}$/, HU: /^HU\d{8}$/, IE: /^IE\d{7}[A-W][A-I]?$|^IE\d[A-Z+*]\d{5}[A-W]$/, IT: /^IT\d{11}$/,
  LT: /^LT(\d{9}|\d{12})$/, LU: /^LU\d{8}$/, LV: /^LV\d{11}$/, MT: /^MT\d{8}$/, NL: /^NL\d{9}B\d{2}$/, PL: /^PL\d{10}$/,
  PT: /^PT\d{9}$/, RO: /^RO\d{2,10}$/, SE: /^SE\d{12}$/, SI: /^SI\d{8}$/, SK: /^SK\d{10}$/,
};

/** Normalise (majuscules, sans espaces/points/tirets) un n° de TVA. */
export const normalizeVatNumber = (value: string) => value.toUpperCase().replace(/[\s.\-]/g, "");

/** Contrôle syntaxique du n° de TVA pour le pays donné (préfixe EL pour la Grèce). */
export const isValidVatNumberFormat = (country: string, value: string): boolean =>
  isEuCountry(country) && VAT_PATTERNS[country].test(normalizeVatNumber(value));

const COUNTRY = /^[A-Z]{2}$/;

/** Détermine le régime de TVA d'une opération (Effect : contexte invalide → `InvalidTaxContextError`). */
export const determineTax = (context: TaxContext): Effect.Effect<TaxDetermination, InvalidTaxContextError> =>
  Effect.gen(function* () {
    const seller = context.sellerCountry.toUpperCase();
    const buyer = context.buyerCountry.toUpperCase();
    if (!COUNTRY.test(seller)) return yield* Effect.fail(new InvalidTaxContextError({ field: "sellerCountry", value: context.sellerCountry }));
    if (!COUNTRY.test(buyer)) return yield* Effect.fail(new InvalidTaxContextError({ field: "buyerCountry", value: context.buyerCountry }));
    if (seller === buyer) return { treatment: "domestic", taxCountry: seller, charged: true, mention: null };
    const sellerEu = isEuCountry(seller);
    if (sellerEu && !isEuCountry(buyer)) return { treatment: "export", taxCountry: null, charged: false, mention: "export-exempt" };
    if (!sellerEu) return { treatment: "domestic", taxCountry: seller, charged: true, mention: null };
    if (context.customerType === "B2B") {
      const vat = context.buyerVatNumber ?? "";
      if (!isValidVatNumberFormat(buyer, vat)) return yield* Effect.fail(new InvalidTaxContextError({ field: "buyerVatNumber", value: vat }));
      return { treatment: "intra-eu-reverse-charge", taxCountry: null, charged: false, mention: context.supplyType === "goods" ? "intra-eu-goods-exempt" : "reverse-charge-services" };
    }
    return context.ossRegistered
      ? { treatment: "intra-eu-b2c-destination", taxCountry: buyer, charged: true, mention: null }
      : { treatment: "intra-eu-b2c-origin", taxCountry: seller, charged: true, mention: null };
  });

const MENTIONS: Record<TaxMention, Record<"fr" | "en" | "es" | "ar", string>> = {
  "reverse-charge-services": {
    fr: "Autoliquidation — TVA due par le preneur (art. 283-2 du CGI, art. 196 de la directive 2006/112/CE).",
    en: "Reverse charge — VAT payable by the customer (Article 196, Directive 2006/112/EC).",
    es: "Inversión del sujeto pasivo — IVA a cargo del destinatario (art. 196 de la Directiva 2006/112/CE).",
    ar: "التحويل العكسي — الضريبة مستحقة على المشتري (المادة 196 من التوجيه 2006/112/EC).",
  },
  "intra-eu-goods-exempt": {
    fr: "Exonération de TVA, article 262 ter I du CGI (livraison intracommunautaire).",
    en: "VAT exempt intra-Community supply (Article 138, Directive 2006/112/EC).",
    es: "Entrega intracomunitaria exenta de IVA (art. 138 de la Directiva 2006/112/CE).",
    ar: "توريد داخل الاتحاد الأوروبي معفى من الضريبة (المادة 138 من التوجيه 2006/112/EC).",
  },
  "export-exempt": {
    fr: "Exonération de TVA, article 262 I du CGI (exportation).",
    en: "VAT exempt export (Article 146, Directive 2006/112/EC).",
    es: "Exportación exenta de IVA (art. 146 de la Directiva 2006/112/CE).",
    ar: "تصدير معفى من الضريبة (المادة 146 من التوجيه 2006/112/EC).",
  },
};

/** Mention légale localisée (repli fr). */
export const legalMention = (mention: TaxMention, locale: string): string => {
  const table = MENTIONS[mention];
  return table[(locale in table ? locale : "fr") as keyof typeof table];
};
