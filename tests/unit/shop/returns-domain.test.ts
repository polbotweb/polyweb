import { describe, expect, it } from "vitest";
import { canTransition } from "@/core/workflow";
import {
  checkReturnRequest, DEFAULT_RETURN_NUMBERING, isReturnReason, isReturnStatus, isValidInspection, OPEN_RETURN_STATUSES, RETURN_MAX_LINES, RETURN_STATUSES,
  returnableQuantities, returnReference, returnRefundMinor, returnWorkflow,
} from "@/modules/shop/domain/returns";

describe("retours : cycle de vie", () => {
  it("chemin nominal et sorties autorisées uniquement", () => {
    const allowed = [
      ["REQUESTED", "APPROVED"], ["REQUESTED", "REJECTED"], ["REQUESTED", "CANCELLED"], ["APPROVED", "RECEIVED"], ["APPROVED", "CANCELLED"],
      ["RECEIVED", "INSPECTED"], ["RECEIVED", "CLOSED"], ["INSPECTED", "REFUNDED"],
    ] as const;
    for (const from of RETURN_STATUSES) for (const to of RETURN_STATUSES) {
      expect(canTransition(returnWorkflow, from, to)).toBe(allowed.some(([a, b]) => a === from && b === to));
    }
  });

  it("refusé et annulé libèrent les quantités, tout le reste les consomme", () => {
    expect(RETURN_STATUSES.filter((s) => !OPEN_RETURN_STATUSES.includes(s))).toEqual(["REJECTED", "CANCELLED"]);
    expect(isReturnStatus("REFUNDED")).toBe(true);
    expect(isReturnStatus("refunded")).toBe(false);
    expect(isReturnReason("defective")).toBe(true);
    expect(isReturnReason("bored")).toBe(false);
  });

  it("numérotation RMA annuelle et référence de remise en stock partagée", () => {
    expect(DEFAULT_RETURN_NUMBERING).toMatchObject({ prefix: "RMA", reset: "yearly" });
    expect(returnReference("CMD-2026-000001")).toBe("RET-CMD-2026-000001");
  });
});

describe("retours : quantités et demande", () => {
  const lines = [{ id: "a", quantity: 3, unitPriceMinor: 1000 }, { id: "b", quantity: 1, unitPriceMinor: 500 }];

  it("retournable = commandé − déjà engagé, jamais négatif", () => {
    const left = returnableQuantities(lines, [{ orderLineId: "a", quantity: 1 }, { orderLineId: "a", quantity: 1 }, { orderLineId: "b", quantity: 4 }]);
    expect([...left]).toEqual([["a", 1], ["b", 0]]);
  });

  it("refuse vide, trop de lignes, ligne inconnue, doublon, quantité hors plage ou non entière", () => {
    const left = returnableQuantities(lines, []);
    expect(checkReturnRequest([], left)).toBe("empty");
    expect(checkReturnRequest([{ orderLineId: "a", quantity: 0 }], left)).toBe("empty");
    expect(checkReturnRequest(Array.from({ length: RETURN_MAX_LINES + 1 }, (_, i) => ({ orderLineId: `x${i}`, quantity: 1 })), left)).toBe("tooMany");
    expect(checkReturnRequest([{ orderLineId: "zz", quantity: 1 }], left)).toBe("unknownLine");
    expect(checkReturnRequest([{ orderLineId: "a", quantity: 1 }, { orderLineId: "a", quantity: 1 }], left)).toBe("duplicate");
    expect(checkReturnRequest([{ orderLineId: "a", quantity: 4 }], left)).toBe("quantity");
    expect(checkReturnRequest([{ orderLineId: "a", quantity: -1 }], left)).toBe("quantity");
    expect(checkReturnRequest([{ orderLineId: "a", quantity: 1.5 }], left)).toBe("quantity");
    expect(checkReturnRequest([{ orderLineId: "a", quantity: 3 }, { orderLineId: "b", quantity: 1 }], left)).toBeNull();
  });
});

describe("retours : inspection et montant", () => {
  it("0 ≤ revendable ≤ accepté ≤ demandé, entiers", () => {
    expect(isValidInspection({ requested: 2, accepted: 2, restocked: 1 })).toBe(true);
    expect(isValidInspection({ requested: 2, accepted: 0, restocked: 0 })).toBe(true);
    expect(isValidInspection({ requested: 2, accepted: 3, restocked: 0 })).toBe(false);
    expect(isValidInspection({ requested: 2, accepted: 1, restocked: 2 })).toBe(false);
    expect(isValidInspection({ requested: 2, accepted: -1, restocked: 0 })).toBe(false);
    expect(isValidInspection({ requested: 2, accepted: 1.5, restocked: 0 })).toBe(false);
  });

  it("remboursement = accepté × prix unitaire TTC figé (port exclu)", () => {
    expect(returnRefundMinor([{ accepted: 2, unitPriceMinor: 2400 }, { accepted: 0, unitPriceMinor: 999 }, { accepted: 1, unitPriceMinor: 1200 }])).toBe(6000);
    expect(returnRefundMinor([])).toBe(0);
  });
});
