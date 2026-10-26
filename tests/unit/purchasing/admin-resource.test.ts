import { describe, expect, it } from "vitest";
import { purchasingAdminFiltersFromUrl } from "@/modules/purchasing/loaders/order-admin.loader";
import { purchaseOrderAdminResource } from "@/modules/purchasing/admin/resource";
import { purchasingModule } from "@/modules/purchasing/module";
import { getPurchasingTranslations } from "@/modules/purchasing/i18n";
import { PURCHASE_ORDER_STATUSES } from "@/modules/purchasing/domain/workflow";

describe("purchasing admin resource", () => {
  it("lit les filtres de l'URL et ignore les valeurs inconnues", () => {
    expect(purchasingAdminFiltersFromUrl("search=bc&status=SENT")).toEqual({ search: "bc", status: "SENT" });
    expect(purchasingAdminFiltersFromUrl("status=BOGUS").status).toBeUndefined();
  });
  it("déclare les actions groupées cancel / close", () => {
    expect(purchaseOrderAdminResource.list?.bulkActions?.map((a) => a.id)).toEqual(["cancel", "close"]);
    expect(purchasingModule.id).toBe("purchasing");
  });
  it("traduit tous les statuts dans les 4 locales", () => {
    for (const locale of ["fr", "en", "es", "ar"] as const) {
      const t = getPurchasingTranslations(locale);
      for (const status of PURCHASE_ORDER_STATUSES) expect(t.statuses[status]).toBeTruthy();
      expect(t.admin.bulk.cancel && t.admin.bulk.close).toBeTruthy();
    }
  });
});
