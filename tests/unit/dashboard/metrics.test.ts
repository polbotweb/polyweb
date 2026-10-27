import { describe, expect, it } from "vitest";
import { marginRateBp, revenueSeries, stockSummary } from "@/modules/dashboard/domain/metrics";

describe("dashboard metrics", () => {
  it("merges series, fills empty buckets and derives margins", () => {
    const { rows, totals } = revenueSeries({
      buckets: ["2026-01-01", "2026-02-01", "2026-03-01"],
      invoices: [{ bucket: "2026-01-01", invoicedNet: 10_000, invoicedGross: 12_000, creditedNet: 1_000, creditedGross: 1_200, invoices: 2, creditNotes: 1 }],
      shop: [{ bucket: "2026-02-01", net: 5_000, gross: 6_000, orders: 3, cogs: 2_000, uncostedUnits: 1 }],
      payments: [{ bucket: "2026-01-01", amount: 7_000 }, { bucket: "2099-01-01", amount: 1 }],
      purchases: [{ bucket: "2026-03-01", amount: 4_000 }],
    });
    expect(rows.map((r) => r.bucket)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(rows[0]).toMatchObject({ revenueNet: 9_000, revenueGross: 10_800, paid: 7_000, grossMargin: 9_000, invoices: 2, creditNotes: 1 });
    expect(rows[1]).toMatchObject({ shopNet: 5_000, revenueNet: 5_000, revenueGross: 6_000, paid: 6_000, shopCogs: 2_000, shopMargin: 3_000, orders: 3, uncostedUnits: 1 });
    expect(rows[2]).toMatchObject({ revenueNet: 0, purchases: 4_000, grossMargin: -4_000 });
    expect(totals).toMatchObject({ revenueNet: 14_000, revenueGross: 16_800, paid: 13_000, purchases: 4_000, grossMargin: 10_000, shopMargin: 3_000, orders: 3 });
  });

  it("computes margin rates in basis points", () => {
    expect(marginRateBp(3_000, 5_000)).toBe(6_000);
    expect(marginRateBp(1, 3)).toBe(3_333);
    expect(marginRateBp(-10, 0)).toBeNull();
    expect(marginRateBp(5, -10)).toBeNull();
  });

  it("values stock, flags low items and sorts alerts", () => {
    const s = stockSummary([
      { itemId: "a", sku: "A", name: "A", level: 10, reserved: 2, unitCost: 150.5 },
      { itemId: "b", sku: "B", name: "B", level: 3, reserved: 0, unitCost: null },
      { itemId: "c", sku: "C", name: "C", level: -2, reserved: 0, unitCost: 100 },
      { itemId: "d", sku: "D", name: "D", level: 5, reserved: 0, unitCost: 10 },
    ], 5);
    expect(s.items.find((i) => i.itemId === "a")).toMatchObject({ available: 8, valuation: 1505, low: false });
    expect(s.items.find((i) => i.itemId === "c")).toMatchObject({ available: -2, valuation: 0, low: true });
    expect(s.low.map((i) => i.sku)).toEqual(["C", "B", "D"]);
    expect(s.totals).toEqual({ items: 4, units: 18, reserved: 2, valuation: 1555, uncosted: 1, lowCount: 3 });
  });
});
