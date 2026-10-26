import { describe, expect, it } from "vitest";
import { crmAdminFiltersFromUrl } from "@/modules/crm/loaders/opportunity-admin.loader";
import { opportunityAdminResource } from "@/modules/crm/admin/resource";
import { crmModule } from "@/modules/crm/module";
import { getCrmTranslations } from "@/modules/crm/i18n";
import { CRM_STAGES, LOST_REASONS } from "@/modules/crm/domain/workflow";

describe("crm admin resource", () => {
  it("lit les filtres de l'URL et ignore les valeurs inconnues", () => {
    expect(crmAdminFiltersFromUrl("search=acme&status=PROPOSAL")).toEqual({ search: "acme", status: "PROPOSAL" });
    expect(crmAdminFiltersFromUrl("status=BOGUS").status).toBeUndefined();
  });
  it("déclare les actions groupées qualify / lose", () => {
    expect(opportunityAdminResource.list?.bulkActions?.map((a) => a.id)).toEqual(["qualify", "lose"]);
    expect(crmModule.id).toBe("crm");
  });
  it("traduit toutes les étapes et motifs dans les 4 locales", () => {
    for (const locale of ["fr", "en", "es", "ar"] as const) {
      const t = getCrmTranslations(locale);
      for (const stage of CRM_STAGES) expect(t.stages[stage]).toBeTruthy();
      for (const reason of LOST_REASONS) expect(t.lostReasons[reason]).toBeTruthy();
    }
  });
});
