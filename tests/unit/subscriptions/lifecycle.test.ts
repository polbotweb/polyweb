/** Règles pures du module subscriptions : actions autorisées, validation des tarifs, patch fournisseur. */
import { describe, expect, it } from "vitest";
import { canCancel, canChangePrice, canResume, isLive, providerPatch, validPrice } from "@/modules/subscriptions/domain/lifecycle";
import { getSubscriptionsTranslations } from "@/modules/subscriptions/i18n";
import { priceLabel } from "@/modules/subscriptions/format";
import { LOCALES } from "@i18n/config";

const base = { providerSubscriptionId: "sub_1", status: "active" as const, cancelAtPeriodEnd: false, providerItemId: "si_1", providerProductId: "prod_1" };

describe("lifecycle", () => {
  it("isLive exclut incomplete et cancelled", () => {
    expect(isLive("active")).toBe(true);
    expect(isLive("past_due")).toBe(true);
    expect(isLive("incomplete")).toBe(false);
    expect(isLive("cancelled")).toBe(false);
  });
  it("résiliation / reprise exclusives et liées au fournisseur", () => {
    expect(canCancel(base)).toBe(true);
    expect(canResume(base)).toBe(false);
    expect(canCancel({ ...base, cancelAtPeriodEnd: true })).toBe(false);
    expect(canResume({ ...base, cancelAtPeriodEnd: true })).toBe(true);
    expect(canCancel({ ...base, providerSubscriptionId: null })).toBe(false);
    expect(canCancel({ ...base, status: "cancelled" })).toBe(false);
  });
  it("changement de tarif : élément et produit fournisseur requis, pas en pause", () => {
    expect(canChangePrice(base)).toBe(true);
    expect(canChangePrice({ ...base, providerItemId: null })).toBe(false);
    expect(canChangePrice({ ...base, providerProductId: null })).toBe(false);
    expect(canChangePrice({ ...base, status: "paused" })).toBe(false);
  });
  it("validPrice borne montant, période, essai et devise", () => {
    const ok = { amountMinor: 990, intervalCount: 1, trialDays: 0, currency: "EUR" };
    expect(validPrice(ok)).toBe(true);
    expect(validPrice({ ...ok, amountMinor: 0 })).toBe(false);
    expect(validPrice({ ...ok, amountMinor: 1.5 })).toBe(false);
    expect(validPrice({ ...ok, intervalCount: 13 })).toBe(false);
    expect(validPrice({ ...ok, trialDays: 731 })).toBe(false);
    expect(validPrice({ ...ok, currency: "eur" })).toBe(false);
  });
});

describe("providerPatch", () => {
  const now = new Date("2026-11-01T10:00:00Z");
  const event = { status: null, cancelAtPeriodEnd: null, currentPeriodEnd: null, providerSubscriptionId: "sub_1", providerCustomerId: null, providerItemId: null, providerProductId: null };
  it("seules les valeurs connues écrasent", () => {
    expect(providerPatch(event, now, false)).toEqual({ providerSubscriptionId: "sub_1" });
    const end = new Date("2026-12-01T00:00:00Z");
    expect(providerPatch({ ...event, status: "trialing", cancelAtPeriodEnd: true, currentPeriodEnd: end, providerCustomerId: "cus_1" }, now, false))
      .toEqual({ providerSubscriptionId: "sub_1", status: "trialing", cancelAtPeriodEnd: true, currentPeriodEnd: end, providerCustomerId: "cus_1" });
  });
  it("suppression : résilié, date de résiliation, plus de résiliation programmée", () => {
    expect(providerPatch({ ...event, status: "active", cancelAtPeriodEnd: true }, now, true)).toMatchObject({ status: "cancelled", cancelledAt: now, cancelAtPeriodEnd: false });
  });
});

describe("i18n et format", () => {
  it("4 locales complètes (statuts, périodes)", () => {
    for (const locale of LOCALES) {
      const t = getSubscriptionsTranslations(locale);
      expect(t.statuses.past_due).toBeTruthy();
      expect(t.every(3, "month")).toContain("3");
    }
  });
  it("libellé de tarif localisé", () => {
    const price = { amountMinor: 990, currency: "EUR", interval: "month" as const, intervalCount: 1 };
    expect(priceLabel(price, "fr")).toMatch(/9,90/);
    expect(priceLabel(price, "en")).toMatch(/9\.90/);
  });
});
