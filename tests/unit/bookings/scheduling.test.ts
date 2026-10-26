import { describe, expect, it } from "vitest";
import { freeSlots, localDate, overlaps, validWindows, windowsOn, withinWindows, zonedToUtc } from "@/core/scheduling";

const at = (iso: string) => new Date(iso);

describe("core/scheduling", () => {
  it("convertit une heure locale en UTC, DST compris", () => {
    expect(zonedToUtc("2026-01-15", "09:00", "Europe/Paris").toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(zonedToUtc("2026-07-15", "09:00", "Europe/Paris").toISOString()).toBe("2026-07-15T07:00:00.000Z");
    expect(zonedToUtc("2026-07-15", "09:00", "UTC").toISOString()).toBe("2026-07-15T09:00:00.000Z");
    expect(zonedToUtc("2026-03-29", "12:00", "America/New_York").toISOString()).toBe("2026-03-29T16:00:00.000Z");
    expect(localDate(at("2026-07-15T23:30:00Z"), "Europe/Paris")).toBe("2026-07-16");
  });

  it("intervalles semi-ouverts : contigus ne se chevauchent pas", () => {
    const a = { start: at("2026-01-01T10:00:00Z"), end: at("2026-01-01T11:00:00Z") };
    expect(overlaps(a, { start: at("2026-01-01T11:00:00Z"), end: at("2026-01-01T12:00:00Z") })).toBe(false);
    expect(overlaps(a, { start: at("2026-01-01T10:59:00Z"), end: at("2026-01-01T12:00:00Z") })).toBe(true);
  });

  it("valide les plages hebdomadaires", () => {
    expect(validWindows([{ weekday: 1, start: "09:00", end: "12:00" }, { weekday: 1, start: "14:00", end: "24:00" }])).toBe(true);
    expect(validWindows([{ weekday: 1, start: "09:00", end: "12:00" }, { weekday: 1, start: "11:00", end: "13:00" }])).toBe(false);
    expect(validWindows([{ weekday: 7, start: "09:00", end: "12:00" }])).toBe(false);
    expect(validWindows([{ weekday: 1, start: "12:00", end: "09:00" }])).toBe(false);
    expect(validWindows([{ weekday: 1, start: "9:00", end: "12:00" }])).toBe(false);
  });

  it("contrôle l'appartenance aux plages, y compris à cheval sur minuit", () => {
    // 2026-01-12 est un lundi.
    const windows = [{ weekday: 1, start: "09:00", end: "12:00" }, { weekday: 1, start: "22:00", end: "24:00" }, { weekday: 2, start: "00:00", end: "02:00" }];
    expect(windowsOn("2026-01-12", windows, "Europe/Paris").map((w) => w.start.toISOString())).toEqual(["2026-01-12T08:00:00.000Z", "2026-01-12T21:00:00.000Z"]);
    expect(withinWindows({ start: at("2026-01-12T08:00:00Z"), end: at("2026-01-12T11:00:00Z") }, windows, "Europe/Paris")).toBe(true);
    expect(withinWindows({ start: at("2026-01-12T10:30:00Z"), end: at("2026-01-12T11:30:00Z") }, windows, "Europe/Paris")).toBe(false);
    expect(withinWindows({ start: at("2026-01-12T22:00:00Z"), end: at("2026-01-13T00:30:00Z") }, windows, "Europe/Paris")).toBe(true);
    expect(withinWindows({ start: at("2026-01-13T08:00:00Z"), end: at("2026-01-13T09:00:00Z") }, windows, "Europe/Paris")).toBe(false);
    expect(withinWindows({ start: at("2026-01-13T08:00:00Z"), end: at("2026-01-13T09:00:00Z") }, [], "Europe/Paris")).toBe(true);
  });

  it("liste les créneaux libres", () => {
    const windows = [{ weekday: 1, start: "09:00", end: "11:00" }];
    const busy = [{ start: at("2026-01-12T08:30:00Z"), end: at("2026-01-12T09:00:00Z") }];
    const slots = freeSlots("2026-01-12", windows, "Europe/Paris", busy, 30);
    expect(slots.map((s) => s.start.toISOString().slice(11, 16))).toEqual(["08:00", "09:00", "09:30"]);
    expect(freeSlots("2026-01-12", windows, "Europe/Paris", [], 30, at("2026-01-12T09:00:00Z"))).toHaveLength(2);
    expect(freeSlots("2026-01-12", [], "UTC", [], 240)).toHaveLength(6);
  });
});
