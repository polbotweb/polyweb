import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { isValidBic, isValidIban, normalizeIban } from "@/core/sepa/iban";
import { PAIN_001_NS, renderPain001 } from "@/core/sepa/pain001";

const debtor = { name: "Acme SAS", iban: "FR1420041010050500013M02606", bic: "BNPAFRPPXXX" };
const creditor = { name: "Fournisseur SA", iban: "DE89370400440532013000", bic: "COBADEFFXXX" };

describe("SEPA IBAN / BIC", () => {
  it("accepte un IBAN français et allemand valides (modulo 97)", () => {
    expect(isValidIban(debtor.iban)).toBe(true);
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(isValidIban("FR1420041010050500013M02607")).toBe(false);
    expect(isValidIban("XX00")).toBe(false);
    expect(normalizeIban("de89 3704 0044 0532 0130 00")).toBe("DE89370400440532013000");
  });

  it("contrôle le BIC", () => {
    expect(isValidBic("BNPAFRPP")).toBe(true);
    expect(isValidBic("BNPAFRPPXXX")).toBe(true);
    expect(isValidBic("short")).toBe(false);
  });
});

describe("pain.001.001.03", () => {
  it("produit un XML équilibré, échappé, avec les totaux du lot", async () => {
    const xml = await Effect.runPromise(renderPain001({
      messageId: "MSG-2026-001",
      createdAt: new Date("2026-11-18T10:00:00Z"),
      requestedExecutionDate: "2026-11-20",
      paymentInfoId: "PMT-2026-001",
      debtor,
      transfers: [
        { endToEndId: "FF-2026-00001", amountMinor: 12345, currency: "EUR", creditor, remittance: "Facture FF-2026-00001" },
        { endToEndId: "FF-2026-00002", amountMinor: 655, currency: "EUR", creditor, remittance: "A & B <test>" },
      ],
    }));
    expect(xml).toContain(`xmlns="${PAIN_001_NS}"`);
    expect(xml).toContain("<CtrlSum>130.00</CtrlSum>");
    expect(xml).toContain("<NbOfTxs>2</NbOfTxs>");
    expect(xml).toContain("<IBAN>FR1420041010050500013M02606</IBAN>");
    expect(xml).toContain("<IBAN>DE89370400440532013000</IBAN>");
    expect(xml).toContain("A &amp; B &lt;test&gt;");
    expect(xml).toContain("<ReqdExctnDt>2026-11-20</ReqdExctnDt>");
  });

  it("refuse un IBAN invalide, un doublon d'EndToEndId ou une devise autre que EUR", async () => {
    const base = {
      messageId: "MSG-1", createdAt: new Date("2026-11-18T10:00:00Z"), requestedExecutionDate: "2026-11-20",
      paymentInfoId: "PMT-1", debtor,
      transfers: [{ endToEndId: "E1", amountMinor: 100, currency: "EUR" as const, creditor: { ...creditor, iban: "DE00" } }],
    };
    const badIban = await Effect.runPromiseExit(renderPain001(base));
    expect(badIban._tag).toBe("Failure");
    const dup = await Effect.runPromiseExit(renderPain001({
      ...base,
      transfers: [
        { endToEndId: "E1", amountMinor: 100, currency: "EUR", creditor },
        { endToEndId: "E1", amountMinor: 100, currency: "EUR", creditor },
      ],
    }));
    expect(dup._tag).toBe("Failure");
  });
});
