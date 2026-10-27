import { describe, expect, it } from "vitest";
import { Effect, Exit } from "effect";
import { canTransition } from "@/core/workflow";
import { bookingLabel, checkSlot, validateBooking } from "@/modules/bookings/domain/booking";
import { validateDeposit, validateResource } from "@/modules/bookings/domain/resource";
import { assignsNumber, bookingWorkflow, isActive, nextStatuses, reoccupiesSlot } from "@/modules/bookings/domain/workflow";

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSyncExit(effect);
const failTag = <A, E extends { _tag: string }>(effect: Effect.Effect<A, E>) => {
  const exit = Effect.runSyncExit(Effect.flip(effect));
  return Exit.isSuccess(exit) ? exit.value._tag : null;
};

describe("bookings domain", () => {
  const resource = { code: " salle-a ", name: " Salle A ", kind: "room", capacity: 8, timezone: "Europe/Paris", slotMinutes: 30, windows: [{ weekday: 2, start: "09:00", end: "12:00" }, { weekday: 1, start: "09:00", end: "18:00" }] };

  it("valide et normalise une ressource", () => {
    const exit = run(validateResource(resource));
    expect(Exit.isSuccess(exit) && exit.value).toMatchObject({ code: "SALLE-A", name: "Salle A", capacity: 8 });
    expect(Exit.isSuccess(exit) && exit.value.windows.map((w) => w.weekday)).toEqual([1, 2]);
    expect(failTag((validateResource({ ...resource, kind: "car" })))).toBe("InvalidResourceError");
    expect(failTag((validateResource({ ...resource, timezone: "Mars/Olympus" })))).toBe("InvalidResourceError");
    expect(failTag((validateResource({ ...resource, slotMinutes: 7 })))).toBe("InvalidResourceError");
    expect(failTag((validateResource({ ...resource, capacity: 0 })))).toBe("InvalidResourceError");
  });

  it("valide une réservation", () => {
    const ok = run(validateBooking({ startsAt: "2026-01-12T09:00:00Z", endsAt: "2026-01-12T10:00:00Z", customerName: " Ada ", customerEmail: "ADA@x.test", partySize: 2 }, 8));
    expect(Exit.isSuccess(ok) && ok.value).toMatchObject({ customerName: "Ada", customerEmail: "ada@x.test", partySize: 2 });
    const base = { startsAt: "2026-01-12T09:00:00Z", endsAt: "2026-01-12T10:00:00Z", customerName: "Ada", customerEmail: null, partySize: 2 };
    expect(failTag((validateBooking({ ...base, endsAt: "2026-01-12T09:00:00Z" }, 8)))).toBe("InvalidBookingError");
    expect(failTag((validateBooking({ ...base, startsAt: "nope" }, 8)))).toBe("InvalidBookingError");
    expect(failTag((validateBooking({ ...base, partySize: 9 }, 8)))).toBe("InvalidBookingError");
    expect(failTag((validateBooking({ ...base, customerName: "  " }, 8)))).toBe("InvalidBookingError");
    expect(failTag((validateBooking({ ...base, endsAt: "2026-01-20T09:00:00Z" }, 8)))).toBe("InvalidBookingError");
  });

  it("refuse un créneau hors plage ou en conflit", () => {
    const windows = [{ weekday: 1, start: "09:00", end: "18:00" }];
    const slot = { start: new Date("2026-01-12T09:00:00Z"), end: new Date("2026-01-12T10:00:00Z") };
    expect(Exit.isSuccess(run(checkSlot(slot, { resourceId: "r", timezone: "Europe/Paris", windows, active: [] })))).toBe(true);
    expect(failTag((checkSlot({ start: new Date("2026-01-12T07:00:00Z"), end: slot.end }, { resourceId: "r", timezone: "Europe/Paris", windows, active: [] })))).toBe("OutsideAvailabilityError");
    const active = [{ id: "b1", start: new Date("2026-01-12T09:30:00Z"), end: new Date("2026-01-12T11:00:00Z") }];
    expect(failTag((checkSlot(slot, { resourceId: "r", timezone: "Europe/Paris", windows, active })))).toBe("BookingConflictError");
  });

  it("cycle de vie et numérotation", () => {
    expect(nextStatuses("REQUESTED")).toEqual(["CONFIRMED", "CANCELLED"]); // EXPIRED : statut système (échéance d’acompte)
    expect(nextStatuses("CONFIRMED")).toEqual(["REQUESTED", "CHECKED_IN", "CANCELLED", "NO_SHOW"]);
    expect(nextStatuses("COMPLETED")).toEqual([]);
    expect(canTransition(bookingWorkflow, "CHECKED_IN", "COMPLETED")).toBe(true);
    expect(canTransition(bookingWorkflow, "CANCELLED", "CONFIRMED")).toBe(false);
    expect(assignsNumber("REQUESTED", "CONFIRMED")).toBe(true);
    expect(assignsNumber("CONFIRMED", "CHECKED_IN")).toBe(false);
    expect(isActive("CHECKED_IN")).toBe(true);
    expect(isActive("NO_SHOW")).toBe(false);
    expect(reoccupiesSlot("CONFIRMED", "REQUESTED")).toBe(false);
    expect(bookingLabel({ number: null, customerName: "Ada" })).toBe("Ada");
    expect(bookingLabel({ number: "RES-2026-00001", customerName: "Ada" })).toBe("RES-2026-00001");
  });
});

describe("bookings — acompte de ressource (core/money)", () => {
  it("saisie décimale exacte, devise ISO 4217, 0 = aucun acompte", () => {
    const ok = (amount: string, currency: string) => { const exit = run(validateDeposit(amount, currency)); return Exit.isSuccess(exit) ? exit.value : null; };
    expect(ok("15.50", "eur")).toEqual({ depositMinor: 1550, depositCurrency: "EUR" });
    expect(ok("15,5", "EUR")).toEqual({ depositMinor: 1550, depositCurrency: "EUR" });
    expect(ok("", "EUR")).toEqual({ depositMinor: 0, depositCurrency: "EUR" });
    expect(ok("500", "JPY")).toEqual({ depositMinor: 500, depositCurrency: "JPY" });
    for (const [amount, currency] of [["1.005", "EUR"], ["1.5", "JPY"], ["-1", "EUR"], ["abc", "EUR"], ["10", "XXX"], ["1000001", "EUR"]] as const) {
      expect(failTag(validateDeposit(amount, currency))).toBe("InvalidResourceError");
    }
  });
});
