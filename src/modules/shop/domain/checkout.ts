/**
 * Saisie du tunnel de commande (adresse de livraison, mode d'expédition) : validation pure,
 * normalisation, et grille des frais de port (prix publics TTC, unités mineures EUR).
 */
import { Effect } from "effect";
import { isEuCountry } from "@/modules/tax/domain/rules";
import { InvalidCheckoutError, type CheckoutField } from "./errors";

export const SHIPPING_METHODS = ["standard", "express", "pickup"] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

/** Pays de livraison acceptés : UE + quelques marchés hors UE (exportation, TVA non facturée). */
export const NON_EU_SHIPPING_COUNTRIES = ["CH", "GB", "NO", "US", "CA"] as const;

export type ShippingZone = "domestic" | "eu" | "world";

/** Frais de port TTC par zone (null = mode indisponible pour la zone). */
const SHIPPING_RATES: Record<ShippingMethod, Record<ShippingZone, number | null>> = {
  standard: { domestic: 590, eu: 1290, world: 2490 },
  express: { domestic: 1290, eu: 2490, world: 4990 },
  pickup: { domestic: 0, eu: null, world: null },
};

export interface ShopSettings {
  readonly sellerCountry: string;
  readonly ossRegistered: boolean;
}

/** Réglages non secrets du tunnel (variables d'environnement, défaut France sans OSS). */
export const shopSettingsFromEnv = (env: Readonly<Record<string, string | undefined>>): ShopSettings => {
  const country = (env.SHOP_SELLER_COUNTRY ?? "").trim().toUpperCase();
  return { sellerCountry: /^[A-Z]{2}$/.test(country) ? country : "FR", ossRegistered: env.SHOP_OSS_REGISTERED === "true" };
};

export const isShippingCountry = (country: string) => isEuCountry(country) || (NON_EU_SHIPPING_COUNTRIES as readonly string[]).includes(country);

export const shippingZone = (sellerCountry: string, country: string): ShippingZone =>
  country === sellerCountry ? "domestic" : isEuCountry(country) ? "eu" : "world";

export const shippingPriceMinor = (method: ShippingMethod, zone: ShippingZone) => SHIPPING_RATES[method][zone];

/** Modes proposés pour une destination, avec leur prix TTC. */
export const shippingOptions = (sellerCountry: string, country: string) => {
  const zone = shippingZone(sellerCountry, country);
  return SHIPPING_METHODS.flatMap((method) => {
    const priceMinor = shippingPriceMinor(method, zone);
    return priceMinor === null ? [] : [{ method, priceMinor }];
  });
};

export interface CheckoutInput {
  readonly email: string;
  readonly customerName: string;
  readonly phone: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly postcode: string;
  readonly city: string;
  readonly country: string;
  readonly shippingMethod: string;
}

export interface ValidCheckout extends Omit<CheckoutInput, "shippingMethod" | "phone" | "addressLine2"> {
  readonly phone: string | null;
  readonly addressLine2: string | null;
  readonly shippingMethod: ShippingMethod;
  readonly shippingMinor: number;
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const PHONE = /^\+?[0-9 ().-]{6,20}$/;
const POSTCODE = /^[A-Za-z0-9 -]{2,12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

const clean = (value: string, max: number) => {
  const trimmed = value.normalize("NFC").replace(/\s+/g, " ").trim();
  return trimmed.length > max || CONTROL.test(trimmed) ? null : trimmed;
};

/** Valide toute la saisie d'un coup (tous les champs fautifs sont signalés ensemble). */
export const validateCheckout = (input: CheckoutInput, settings: ShopSettings) =>
  Effect.suspend(() => {
    const errors: CheckoutField[] = [];
    const email = clean(input.email, 254)?.toLowerCase() ?? "";
    if (!EMAIL.test(email)) errors.push("email");
    const customerName = clean(input.customerName, 120) ?? "";
    if (customerName.length < 2) errors.push("customerName");
    const phone = clean(input.phone, 20);
    if (phone === null || (phone !== "" && !PHONE.test(phone))) errors.push("phone");
    const addressLine1 = clean(input.addressLine1, 200) ?? "";
    if (addressLine1.length < 3) errors.push("addressLine1");
    const addressLine2 = clean(input.addressLine2, 200);
    if (addressLine2 === null) errors.push("addressLine2");
    const postcode = clean(input.postcode, 12)?.toUpperCase() ?? "";
    if (!POSTCODE.test(postcode)) errors.push("postcode");
    const city = clean(input.city, 120) ?? "";
    if (city.length < 1) errors.push("city");
    const country = (clean(input.country, 2) ?? "").toUpperCase();
    if (!isShippingCountry(country)) errors.push("country");
    const method = (SHIPPING_METHODS as readonly string[]).includes(input.shippingMethod) ? (input.shippingMethod as ShippingMethod) : null;
    const shippingMinor = method && !errors.includes("country") ? shippingPriceMinor(method, shippingZone(settings.sellerCountry, country)) : null;
    if (shippingMinor === null) errors.push("shippingMethod");
    if (errors.length > 0) return Effect.fail(new InvalidCheckoutError({ fields: errors }));
    return Effect.succeed<ValidCheckout>({
      email, customerName, phone: phone || null, addressLine1, addressLine2: addressLine2 || null, postcode, city, country,
      shippingMethod: method!, shippingMinor: shippingMinor!,
    });
  });
