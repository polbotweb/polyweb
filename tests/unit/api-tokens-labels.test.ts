import { describe, expect, it } from "vitest";
import { describeScope, getApiTokensLabels } from "@/core/localization/api-tokens-labels";

const resources = [
  { name: "contacts", scope: "crm:read", writeScope: "crm:write" },
  { name: "companies", scope: "crm:read" },
  { name: "invoices", scope: "sales:read" },
];

describe("describeScope", () => {
  it("libellé dédié pour les scopes du cœur, dans chaque locale", () => {
    for (const l of ["fr", "en", "es", "ar"] as const) expect(describeScope(getApiTokensLabels(l), "content:read", resources)).not.toBe("content:read");
  });
  it("dérive le libellé des ressources du registre", () => {
    const t = getApiTokensLabels("en");
    expect(describeScope(t, "crm:read", resources)).toBe("Read: contacts, companies");
    expect(describeScope(t, "crm:write", resources)).toBe("Write: contacts");
    expect(describeScope(t, "unknown:read", resources)).toBe("unknown:read");
  });
});
