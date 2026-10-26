import { describe, expect, it } from "vitest";
import { logisticsAdminFiltersFromUrl } from "@/modules/logistics/loaders/shipment-admin.loader";
import { shipmentAdminResource } from "@/modules/logistics/admin/resource";
import { logisticsModule } from "@/modules/logistics/module";
import { getLogisticsTranslations } from "@/modules/logistics/i18n";
import { SHIPMENT_STATUSES } from "@/modules/logistics/domain/workflow";
import { MOVEMENT_KINDS } from "@/modules/logistics/domain/stock";

describe("logistics admin resource", () => {
  it("lit les filtres de l'URL et ignore les valeurs inconnues", () => {
    expect(logisticsAdminFiltersFromUrl("search=bl&status=SHIPPED")).toEqual({ search: "bl", status: "SHIPPED" });
    expect(logisticsAdminFiltersFromUrl("status=BOGUS").status).toBeUndefined();
  });
  it("déclare les actions groupées cancel / deliver", () => {
    expect(shipmentAdminResource.list?.bulkActions?.map((a) => a.id)).toEqual(["cancel", "deliver"]);
    expect(logisticsModule.id).toBe("logistics");
  });
  it("traduit tous les statuts et types de mouvement dans les 4 locales", () => {
    for (const locale of ["fr", "en", "es", "ar"] as const) {
      const t = getLogisticsTranslations(locale);
      for (const status of SHIPMENT_STATUSES) expect(t.statuses[status]).toBeTruthy();
      for (const kind of MOVEMENT_KINDS) expect(t.movementKinds[kind]).toBeTruthy();
      expect(t.admin.bulk.cancel && t.admin.bulk.deliver).toBeTruthy();
    }
  });
});
