import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { matchDocument, priceToleranceMinor } from "@/modules/purchasing/domain/matching";
import { ceilToPack, reorderAction, suggestReorder, validateReorderRule } from "@/modules/purchasing/domain/reorder";
import { allocateLandedCost } from "@/modules/purchasing/domain/landed-costs";
import { canAutoSend, DEFAULT_PURCHASING_SETTINGS, validatePurchasingSettings } from "@/modules/purchasing/domain/settings";

const line = (id: string, ordered: number, received: number, invoiced: number, poPrice: number, invPrice: number) => ({
  id, orderedQuantity: ordered, receivedQuantity: received, invoicedQuantity: invoiced,
  orderedUnitPriceMinor: poPrice, invoicedUnitPriceMinor: invPrice,
});

describe("rapprochement", () => {
  const tolerance = { absoluteMinor: 100, percent: 1 };

  it("rapproche en 3 voies sur les quantités reçues", () => {
    const result = matchDocument([line("a", 10, 8, 8, 1000, 1000)], "three_way", tolerance, "allow_with_acceptance");
    expect(result.status).toBe("matched");
    expect(result.payable).toBe(true);
    const two = matchDocument([line("a", 10, 8, 8, 1000, 1000)], "two_way", tolerance, "allow_with_acceptance");
    expect(two.status).toBe("qty_variance");
    expect(two.payable).toBe(false);
  });

  it("tolère un écart de prix dans le max(1 €, 1 %)", () => {
    expect(priceToleranceMinor(10_000, 2, tolerance)).toBe(200); // 1 % de 20000 = 200 > 100
    const ok = matchDocument([line("a", 2, 2, 2, 10_000, 10_050)], "three_way", tolerance, "block");
    expect(ok.payable).toBe(true);
    const ko = matchDocument([line("a", 2, 2, 2, 10_000, 10_200)], "three_way", tolerance, "block");
    expect(ko.blocked).toBe(true);
    expect(ko.payable).toBe(false);
  });

  it("autorise l'émission après acceptation explicite si la politique le permet", () => {
    const lines = [line("a", 2, 2, 2, 10_000, 12_000)];
    const blocked = matchDocument(lines, "three_way", tolerance, "block", new Set(["a"]));
    expect(blocked.blocked).toBe(true);
    const accepted = matchDocument(lines, "three_way", tolerance, "allow_with_acceptance", new Set(["a"]));
    expect(accepted.payable).toBe(true);
    expect(accepted.status).toBe("accepted");
  });
});

describe("réassort", () => {
  it("suggère un complément arrondi au colis quand le disponible passe au min", async () => {
    const rule = await Effect.runPromise(validateReorderRule({
      itemId: "i", warehouseId: "w", minQty: 5, maxQty: 20, packQty: 6, preferredSupplierId: "s",
    }));
    expect(suggestReorder(rule, { onHand: 6, outstanding: 0, reserved: 0 }, false)).toBeNull();
    const hit = suggestReorder(rule, { onHand: 5, outstanding: 0, reserved: 0 }, false);
    expect(hit?.suggestedQty).toBe(18); // 20-5=15, ceil to 6 → 18
    expect(ceilToPack(1, 6)).toBe(6);
    const withOpen = suggestReorder(rule, { onHand: 2, outstanding: 10, reserved: 0 }, false);
    expect(withOpen).toBeNull(); // 12 > 5
  });

  it("n'envoie automatiquement que si le mode et le catalogue de confiance le permettent", () => {
    expect(reorderAction("suggestions", true, true)).toEqual({ createDraft: false, autoSend: false });
    expect(reorderAction("auto_draft", true, true)).toEqual({ createDraft: true, autoSend: false });
    expect(reorderAction("auto_send", true, false)).toEqual({ createDraft: true, autoSend: false });
    expect(reorderAction("auto_send", true, true)).toEqual({ createDraft: true, autoSend: true });
    expect(canAutoSend({ ...DEFAULT_PURCHASING_SETTINGS, reorderMode: "auto_send" }, false)).toBe(false);
    expect(canAutoSend({ ...DEFAULT_PURCHASING_SETTINGS, reorderMode: "auto_send" }, true)).toBe(true);
  });

  it("valide les réglages par défaut", async () => {
    const settings = await Effect.runPromise(validatePurchasingSettings(DEFAULT_PURCHASING_SETTINGS));
    expect(settings.matchingMode).toBe("three_way");
  });
});

describe("frais d'approche", () => {
  it("répartit au prorata de la valeur et retrouve exactement le total", async () => {
    const parts = await Effect.runPromise(allocateLandedCost(100, "EUR", "value", [
      { orderLineId: "a", netMinor: 75, quantity: 1, weightGrams: 1000 },
      { orderLineId: "b", netMinor: 25, quantity: 1, weightGrams: 1000 },
    ]));
    expect(parts.map((p) => p.amountMinor).reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts[0]?.amountMinor).toBe(75);
    expect(parts[1]?.amountMinor).toBe(25);
  });

  it("répartit à la quantité avec le plus fort reste", async () => {
    const parts = await Effect.runPromise(allocateLandedCost(100, "EUR", "quantity", [
      { orderLineId: "a", netMinor: 1, quantity: 1, weightGrams: null },
      { orderLineId: "b", netMinor: 1, quantity: 2, weightGrams: null },
    ]));
    expect(parts.map((p) => p.amountMinor).sort()).toEqual([33, 67]);
  });
});
