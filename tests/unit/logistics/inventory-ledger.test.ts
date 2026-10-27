import { describe, expect, it } from "vitest";
import { Effect, Exit } from "effect";
import {
  countAdjustments, countSummary, ensureOpen, isInventoryCountStatus, MAX_COUNTED_QUANTITY, parseCountedQuantity,
} from "@/modules/logistics/domain/inventory";
import { LEDGER_MAX_PAGE, ledgerDateRange, ledgerQuery, likePrefix, parseLedgerFilters } from "@/modules/logistics/domain/ledger";
import { DEFAULT_INVENTORY_NUMBERING } from "@/modules/logistics/domain/numbering";

const ok = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSync(effect);
const ko = <A, E>(effect: Effect.Effect<A, E>) => {
  const exit = Effect.runSyncExit(effect);
  expect(Exit.isFailure(exit)).toBe(true);
  return exit;
};

describe("inventaires — domaine", () => {
  it("reconnaît les statuts et n'autorise les actions que sur un inventaire ouvert", () => {
    expect(isInventoryCountStatus("OPEN")).toBe(true);
    expect(isInventoryCountStatus("open")).toBe(false);
    ok(ensureOpen("OPEN", "validate"));
    ko(ensureOpen("VALIDATED", "count"));
    ko(ensureOpen("CANCELLED", "cancel"));
  });

  it("lit une quantité comptée : vide = non compté, entier ≥ 0 borné", () => {
    expect(ok(parseCountedQuantity(""))).toBeNull();
    expect(ok(parseCountedQuantity("  "))).toBeNull();
    expect(ok(parseCountedQuantity(null))).toBeNull();
    expect(ok(parseCountedQuantity(undefined))).toBeNull();
    expect(ok(parseCountedQuantity(" 012 "))).toBe(12);
    expect(ok(parseCountedQuantity(0))).toBe(0);
    expect(ok(parseCountedQuantity(String(MAX_COUNTED_QUANTITY)))).toBe(MAX_COUNTED_QUANTITY);
    for (const bad of ["-1", "1.5", "1e3", "abc", "0x10", String(MAX_COUNTED_QUANTITY + 1), -2, 2.5]) ko(parseCountedQuantity(bad));
  });

  it("calcule les écarts sur les seules lignes comptées, à partir des niveaux actuels", () => {
    const levels = new Map([["a", 10], ["b", 3]]);
    expect(ok(countAdjustments([{ itemId: "a", counted: 7 }, { itemId: "b", counted: null }, { itemId: "c", counted: 2 }], levels))).toEqual([
      { itemId: "a", system: 10, counted: 7, variance: -3 },
      { itemId: "c", system: 0, counted: 2, variance: 2 },
    ]);
    ko(countAdjustments([{ itemId: "a", counted: null }], levels));
    ko(countAdjustments([], levels));
  });

  it("résume un inventaire (comptées, écarts non nuls, écart net)", () => {
    expect(countSummary([{ counted: 7, variance: -3 }, { counted: 3, variance: 0 }, { counted: null, variance: null }, { counted: 5, variance: 2 }])).toEqual({ total: 4, counted: 3, discrepancies: 2, netVariance: -1 });
    expect(countSummary([])).toEqual({ total: 0, counted: 0, discrepancies: 0, netVariance: 0 });
  });

  it("numérote les inventaires INV-AAAA-NNNNN, remise à zéro annuelle", () => {
    expect(DEFAULT_INVENTORY_NUMBERING).toMatchObject({ prefix: "INV", pattern: "{prefix}-{YYYY}-{seq:5}" });
  });
});

describe("grand livre — filtres", () => {
  const parse = (query: string) => parseLedgerFilters(new URLSearchParams(query));
  const uuid = "0b9c4a8e-6f5d-4c3b-9a2e-1d0f8e7c6b5a";

  it("lit des filtres valides et normalise le SKU", () => {
    expect(parse(`warehouse=${uuid}&sku= box-1 &kind=receipt&source=inventory&user=u_1&from=2026-01-01&to=2026-01-31&page=3`)).toEqual({
      warehouseId: uuid, sku: "BOX-1", kind: "receipt", source: "inventory", userId: "u_1", from: "2026-01-01", to: "2026-01-31", page: 3,
    });
  });

  it("ignore les valeurs invalides et borne la page", () => {
    expect(parse("warehouse=x&sku=a%20b&kind=drop&source=ORDER&user=a%27b&from=2026-02-30&to=2026-13-01&page=-2")).toEqual({
      warehouseId: null, sku: null, kind: null, source: null, userId: null, from: null, to: null, page: 1,
    });
    expect(parse("page=1.5").page).toBe(1);
    expect(parse("page=99999999").page).toBe(LEDGER_MAX_PAGE);
    expect(parse(`sku=${"A".repeat(65)}`).sku).toBeNull();
  });

  it("remet dans l'ordre des bornes de dates inversées", () => {
    expect(parse("from=2026-03-10&to=2026-03-01")).toMatchObject({ from: "2026-03-01", to: "2026-03-10" });
    expect(parse("to=2026-03-01")).toMatchObject({ from: null, to: "2026-03-01" });
  });

  it("convertit les dates incluses en intervalle UTC [début, lendemain)", () => {
    expect(ledgerDateRange({ from: "2026-03-01", to: "2026-03-01" })).toEqual({ start: new Date("2026-03-01T00:00:00Z"), end: new Date("2026-03-02T00:00:00Z") });
    expect(ledgerDateRange({ from: null, to: null })).toEqual({ start: null, end: null });
  });

  it("reconstruit l'URL d'une page en conservant les filtres", () => {
    const filters = parse(`warehouse=${uuid}&sku=box&source=transfer&page=2`);
    expect(ledgerQuery(filters)).toBe(`warehouse=${uuid}&sku=BOX&source=transfer&page=2`);
    expect(ledgerQuery(filters, 1)).toBe(`warehouse=${uuid}&sku=BOX&source=transfer`);
    expect(parseLedgerFilters(new URLSearchParams(ledgerQuery(filters, 4)))).toEqual({ ...filters, page: 4 });
  });

  it("échappe les jokers LIKE d'un préfixe", () => {
    expect(likePrefix("CAP_X")).toBe("CAP\\_X%");
    expect(likePrefix("50%\\")).toBe("50\\%\\\\%");
  });
});
