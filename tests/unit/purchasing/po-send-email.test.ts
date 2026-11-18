import { describe, expect, it } from "vitest";
import { purchaseOrderSendEmail } from "@/modules/purchasing/notifications/po-send-email";

const ctx = { locale: "fr" as const, siteUrl: "https://example.test" };
const base = { number: "BC-2026-00001", title: "Vis", supplierName: "Acme" };

describe("purchasing.po-send", () => {
  it("utilise le gabarit par défaut sans surcharge", () => {
    const rendered = purchaseOrderSendEmail.render(base, ctx);
    expect(rendered.subject).toBe("Bon de commande BC-2026-00001");
    expect(rendered.body).toContain("BC-2026-00001");
  });

  it("applique une surcharge d'objet et de corps, avec repli sur le défaut", () => {
    const rendered = purchaseOrderSendEmail.render({
      ...base,
      overrideSubject: "PO {number} pour {supplierName}",
      overrideBody: "Pièce jointe : {title}",
    }, ctx);
    expect(rendered.subject).toBe("PO BC-2026-00001 pour Acme");
    expect(rendered.body).toBe("Pièce jointe : Vis");
    const fallback = purchaseOrderSendEmail.render(base, { ...ctx, locale: "en" });
    expect(fallback.subject).toBe("Purchase order BC-2026-00001");
  });
});
