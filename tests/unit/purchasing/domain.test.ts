import { describe, expect, it } from "vitest";
import { Effect, Exit } from "effect";
import { validatePurchaseOrder, validateSupplier, purchaseOrderLabel } from "@/modules/purchasing/domain/order";
import { planReceipt, outstanding } from "@/modules/purchasing/domain/receipt";
import { assignsNumber, nextStatuses, purchaseOrderWorkflow } from "@/modules/purchasing/domain/workflow";
import { canTransition } from "@/core/workflow";

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSyncExit(effect);

describe("purchasing domain", () => {
  it("valide et normalise un fournisseur", () => {
    const exit = run(validateSupplier({ code: " acme-1 ", name: " Acme ", email: "ACHATS@Acme.test", country: "fr", paymentTermDays: 30 }));
    expect(Exit.isSuccess(exit) && exit.value).toEqual({ code: "ACME-1", name: "Acme", email: "achats@acme.test", country: "FR", paymentTermDays: 30 });
    expect(Exit.isFailure(run(validateSupplier({ code: "??", name: "x", email: null, country: null, paymentTermDays: 0 })))).toBe(true);
    expect(Exit.isFailure(run(validateSupplier({ code: "A", name: "x", email: "pas-un-email", country: null, paymentTermDays: 0 })))).toBe(true);
    expect(Exit.isFailure(run(validateSupplier({ code: "A", name: "x", email: null, country: null, paymentTermDays: 400 })))).toBe(true);
  });

  it("calcule lignes et total HT en unités mineures", () => {
    const exit = run(validatePurchaseOrder({ currency: "eur", expectedDate: "2026-11-30", lines: [
      { sku: "vis-4", quantity: 3, unitPrice: "12,50" },
      { sku: "ECROU", description: " M4 ", quantity: 1000, unitPrice: "0.015" },
    ] }));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.currency).toBe("EUR");
    expect(exit.value.lines.map((l) => [l.sku, l.unitPriceMinor, l.netMinor])).toEqual([["VIS-4", 1250, 3750], ["ECROU", 2, 2000]]);
    expect(exit.value.lines[1]!.description).toBe("M4");
    expect(exit.value.netMinor).toBe(5750);
  });

  it("refuse devise, date, quantité, prix ou lignes invalides", () => {
    const base = { currency: "EUR", expectedDate: null, lines: [{ sku: "A", quantity: 1, unitPrice: "1" }] };
    expect(Exit.isFailure(run(validatePurchaseOrder({ ...base, currency: "XXX" })))).toBe(true);
    expect(Exit.isFailure(run(validatePurchaseOrder({ ...base, expectedDate: "30/11/2026" })))).toBe(true);
    expect(Exit.isFailure(run(validatePurchaseOrder({ ...base, lines: [] })))).toBe(true);
    expect(Exit.isFailure(run(validatePurchaseOrder({ ...base, lines: [{ sku: "A", quantity: 0, unitPrice: "1" }] })))).toBe(true);
    expect(Exit.isFailure(run(validatePurchaseOrder({ ...base, lines: [{ sku: "A", quantity: 1, unitPrice: "abc" }] })))).toBe(true);
    expect(Exit.isFailure(run(validatePurchaseOrder({ ...base, lines: [{ sku: "A", quantity: 1, unitPrice: "-2" }] })))).toBe(true);
  });

  it("planifie une réception partielle puis complète, sans sur-réception", () => {
    const lines = [{ id: "l1", sku: "A", quantity: 10, receivedQuantity: 0 }, { id: "l2", sku: "B", quantity: 5, receivedQuantity: 0 }];
    const partial = run(planReceipt(lines, [{ lineId: "l1", quantity: 4 }, { lineId: "l2", quantity: 0 }]));
    expect(Exit.isSuccess(partial) && partial.value.status).toBe("PARTIALLY_RECEIVED");
    expect(Exit.isSuccess(partial) && partial.value.lines).toEqual([{ lineId: "l1", sku: "A", quantity: 4 }]);
    const after = [{ ...lines[0]!, receivedQuantity: 4 }, lines[1]!];
    expect(outstanding(after[0]!)).toBe(6);
    const full = run(planReceipt(after, [{ lineId: "l1", quantity: 6 }, { lineId: "l2", quantity: 5 }]));
    expect(Exit.isSuccess(full) && full.value.status).toBe("RECEIVED");
    expect(Exit.isFailure(run(planReceipt(after, [{ lineId: "l1", quantity: 7 }])))).toBe(true);
    expect(Exit.isFailure(run(planReceipt(after, [{ lineId: "inconnue", quantity: 1 }])))).toBe(true);
    expect(Exit.isFailure(run(planReceipt(after, [{ lineId: "l1", quantity: 0 }])))).toBe(true);
  });

  it("cycle de vie : numéro à l'envoi, statuts de réception non manuels", () => {
    expect(assignsNumber("DRAFT", "SENT")).toBe(true);
    expect(canTransition(purchaseOrderWorkflow, "DRAFT", "RECEIVED")).toBe(false);
    expect(nextStatuses("SENT")).toEqual(["DRAFT", "CANCELLED"]);
    expect(nextStatuses("PARTIALLY_RECEIVED")).toEqual(["CLOSED"]);
    expect(nextStatuses("CLOSED")).toEqual([]);
    expect(purchaseOrderLabel({ number: null, title: "Vis" })).toBe("Vis");
  });
});
