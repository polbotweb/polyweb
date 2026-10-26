import { describe, expect, it } from "vitest";
import { bookingsAdminFiltersFromUrl } from "@/modules/bookings/loaders/booking-admin.loader";
import { bookingAdminResource } from "@/modules/bookings/admin/resource";
import { bookingsModule } from "@/modules/bookings/module";
import { getBookingsTranslations } from "@/modules/bookings/i18n";
import { BOOKING_STATUSES } from "@/modules/bookings/domain/workflow";
import { RESOURCE_KINDS } from "@/modules/bookings/domain/resource";

describe("bookings admin resource", () => {
  it("lit les filtres de l'URL et ignore les valeurs inconnues", () => {
    expect(bookingsAdminFiltersFromUrl("search=dupont&status=CONFIRMED")).toEqual({ search: "dupont", status: "CONFIRMED" });
    expect(bookingsAdminFiltersFromUrl("status=BOGUS").status).toBeUndefined();
  });
  it("déclare les actions groupées cancel / noShow / complete", () => {
    expect(bookingAdminResource.list?.bulkActions?.map((a) => a.id)).toEqual(["cancel", "noShow", "complete"]);
    expect(bookingsModule.id).toBe("bookings");
  });
  it("traduit statuts, types et jours dans les 4 locales", () => {
    for (const locale of ["fr", "en", "es", "ar"] as const) {
      const t = getBookingsTranslations(locale);
      for (const status of BOOKING_STATUSES) expect(t.statuses[status]).toBeTruthy();
      for (const kind of RESOURCE_KINDS) expect(t.kinds[kind]).toBeTruthy();
      expect(t.weekdays).toHaveLength(7);
      expect(t.admin.bulk.cancel && t.admin.bulk.noShow && t.admin.bulk.complete).toBeTruthy();
    }
  });
});
