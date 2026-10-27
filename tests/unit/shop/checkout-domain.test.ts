import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { orderAccessToken, signCartToken, verifyCartToken, verifyOrderAccessToken } from "@/modules/shop/domain/cart-token";
import { priceOrder } from "@/modules/shop/domain/pricing";
import { shippingOptions, shopSettingsFromEnv, validateCheckout } from "@/modules/shop/domain/checkout";
import { ADMIN_ORDER_TRANSITIONS, orderWorkflow } from "@/modules/shop/domain/orders";
import { canTransition } from "@/core/workflow";

const SECRET = "test-secret";
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSync(Effect.result(effect));

describe("jetons panier / commande", () => {
  it("vérifie la signature et refuse les jetons altérés ou forgés", () => {
    const token = signCartToken("cart_12345678", SECRET);
    expect(verifyCartToken(token, SECRET)).toBe("cart_12345678");
    expect(verifyCartToken(token, "autre")).toBeNull();
    expect(verifyCartToken(`cart_87654321.${token.split(".")[1]}`, SECRET)).toBeNull();
    expect(verifyCartToken("cart_12345678", SECRET)).toBeNull();
    expect(verifyCartToken("../../x.y", SECRET)).toBeNull();
    expect(verifyCartToken(undefined, SECRET)).toBeNull();
    expect(verifyCartToken("a".repeat(500), SECRET)).toBeNull();
  });
  it("lien de suivi invité lié à la commande", () => {
    const token = orderAccessToken("order_12345678", SECRET);
    expect(verifyOrderAccessToken("order_12345678", token, SECRET)).toBe(true);
    expect(verifyOrderAccessToken("order_87654321", token, SECRET)).toBe(false);
    expect(verifyOrderAccessToken("order_12345678", null, SECRET)).toBe(false);
  });
});

describe("priceOrder", () => {
  const base = { currency: "EUR" as const, sellerCountry: "FR", ossRegistered: false, date: "2026-10-27" };
  it("national : le TTC est la somme exacte des prix affichés, ventilé une fois par taux", () => {
    const result = run(priceOrder([
      { key: "a", unitGrossMinor: 1999, quantity: 3, category: "standard" },
      { key: "ship", unitGrossMinor: 590, quantity: 1, category: "standard" },
      { key: "b", unitGrossMinor: 1055, quantity: 1, category: "reduced-2" },
    ], { ...base, buyerCountry: "FR" }));
    expect(result._tag).toBe("Success");
    if (result._tag !== "Success") return;
    const p = result.success;
    expect(p.gross.amountMinor).toBe(1999 * 3 + 590 + 1055);
    expect(p.net.amountMinor + p.tax.amountMinor).toBe(p.gross.amountMinor);
    expect(p.byRate.map((r) => r.ratePercent)).toEqual(["5.5", "20"]);
    expect(p.byRate[1]).toMatchObject({ base: { amountMinor: 5489 }, tax: { amountMinor: 1098 } });
    expect(p.treatment).toBe("domestic");
  });
  it("UE sans OSS : TVA française conservée", () => {
    const result = run(priceOrder([{ key: "a", unitGrossMinor: 1200, quantity: 1, category: "standard" }], { ...base, buyerCountry: "DE" }));
    expect(result._tag === "Success" && result.success.gross.amountMinor).toBe(1200);
  });
  it("UE avec OSS : HT recalculé au taux de destination", () => {
    const result = run(priceOrder([{ key: "a", unitGrossMinor: 1200, quantity: 1, category: "standard" }], { ...base, ossRegistered: true, buyerCountry: "DE" }));
    expect(result._tag).toBe("Success");
    if (result._tag !== "Success") return;
    expect(result.success).toMatchObject({ taxCountry: "DE", net: { amountMinor: 1000 }, tax: { amountMinor: 190 }, gross: { amountMinor: 1190 } });
  });
  it("export : TVA non facturée, le client paie le HT", () => {
    const result = run(priceOrder([{ key: "a", unitGrossMinor: 1200, quantity: 1, category: "standard" }], { ...base, buyerCountry: "US" }));
    expect(result._tag === "Success" && result.success).toMatchObject({ treatment: "export", tax: { amountMinor: 0 }, gross: { amountMinor: 1000 } });
  });
  it("refuse panier vide, quantités et prix invalides", () => {
    expect(run(priceOrder([], { ...base, buyerCountry: "FR" }))._tag).toBe("Failure");
    expect(run(priceOrder([{ key: "a", unitGrossMinor: 100, quantity: 0, category: "standard" }], { ...base, buyerCountry: "FR" }))._tag).toBe("Failure");
    expect(run(priceOrder([{ key: "a", unitGrossMinor: 100, quantity: 100, category: "standard" }], { ...base, buyerCountry: "FR" }))._tag).toBe("Failure");
    expect(run(priceOrder([{ key: "a", unitGrossMinor: -1, quantity: 1, category: "standard" }], { ...base, buyerCountry: "FR" }))._tag).toBe("Failure");
  });
});

describe("validateCheckout", () => {
  const settings = shopSettingsFromEnv({});
  const valid = { email: " Jane@Example.com ", customerName: "Jane Doe", phone: "", addressLine1: "1 rue de la Paix", addressLine2: "", postcode: "75002", city: "Paris", country: "fr", shippingMethod: "standard" };
  it("normalise une saisie valide et chiffre le port", () => {
    const result = run(validateCheckout(valid, settings));
    expect(result._tag === "Success" && result.success).toMatchObject({ email: "jane@example.com", country: "FR", phone: null, addressLine2: null, shippingMinor: 590 });
  });
  it("signale tous les champs fautifs", () => {
    const result = run(validateCheckout({ ...valid, email: "x", postcode: "<script>", country: "ZZ", shippingMethod: "drone" }, settings));
    expect(result._tag === "Failure" && result.failure.fields).toEqual(["email", "postcode", "country", "shippingMethod"]);
  });
  it("retrait en boutique réservé au pays du vendeur", () => {
    expect(run(validateCheckout({ ...valid, country: "DE", shippingMethod: "pickup" }, settings))._tag).toBe("Failure");
    expect(shippingOptions("FR", "FR").map((o) => o.method)).toEqual(["standard", "express", "pickup"]);
    expect(shippingOptions("FR", "US").map((o) => o.method)).toEqual(["standard", "express"]);
  });
  it("réglages : pays vendeur et OSS depuis l'environnement", () => {
    expect(shopSettingsFromEnv({ SHOP_SELLER_COUNTRY: "be", SHOP_OSS_REGISTERED: "true" })).toEqual({ sellerCountry: "BE", ossRegistered: true });
    expect(shopSettingsFromEnv({ SHOP_SELLER_COUNTRY: "nope" }).sellerCountry).toBe("FR");
  });
});

describe("orderWorkflow", () => {
  it("interdit de repasser une commande payée en attente ou annulée", () => {
    expect(canTransition(orderWorkflow, "PENDING_PAYMENT", "PAID")).toBe(true);
    expect(canTransition(orderWorkflow, "PAID", "CANCELLED")).toBe(false);
    expect(canTransition(orderWorkflow, "PAID", "PENDING_PAYMENT")).toBe(false);
    expect(ADMIN_ORDER_TRANSITIONS).not.toContain("PAID");
  });
});
