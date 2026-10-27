import { describe, expect, it } from "vitest";
import { bucketStart, bucketStarts, dashboardFiltersFromUrl, isIsoDate, lowStockThresholdFromEnv, MAX_BUCKETS } from "@/modules/dashboard/domain/period";

const parse = (q: string, today = "2026-10-27") => dashboardFiltersFromUrl(new URLSearchParams(q), { today });

describe("dashboard period", () => {
  it("validates calendar days strictly", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate("2026-10-27T00:00")).toBe(false);
  });

  it("computes bucket starts per granularity", () => {
    expect(bucketStart("2026-08-17", "month")).toBe("2026-08-01");
    expect(bucketStart("2026-08-17", "quarter")).toBe("2026-07-01");
    expect(bucketStart("2026-12-31", "quarter")).toBe("2026-10-01");
    expect(bucketStart("2026-08-17", "year")).toBe("2026-01-01");
  });

  it("lists buckets covering the range, across years", () => {
    expect(bucketStarts("2025-11-15", "2026-02-01", "month")).toEqual(["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);
    expect(bucketStarts("2025-11-15", "2026-04-01", "quarter")).toEqual(["2025-10-01", "2026-01-01", "2026-04-01"]);
    expect(bucketStarts("2024-06-01", "2026-01-01", "year")).toEqual(["2024-01-01", "2025-01-01", "2026-01-01"]);
  });

  it("defaults to the current year, monthly, EUR", () => {
    const { filters, errors } = parse("");
    expect(errors).toEqual([]);
    expect(filters).toEqual({ from: "2026-01-01", to: "2026-10-27", granularity: "month", currency: "EUR", lowStockThreshold: 5 });
  });

  it("accepts valid filters", () => {
    const { filters, errors } = parse("from=2025-01-01&to=2025-12-31&granularity=quarter&currency=usd&threshold=12");
    expect(errors).toEqual([]);
    expect(filters).toEqual({ from: "2025-01-01", to: "2025-12-31", granularity: "quarter", currency: "USD", lowStockThreshold: 12 });
  });

  it("falls back and reports invalid inputs (never throws)", () => {
    expect(parse("from=2026-02-30").errors).toContain("invalidDate");
    expect(parse("from=2026-05-01&to=2026-01-01")).toMatchObject({ errors: ["invalidRange"], filters: { from: "2026-01-01", to: "2026-10-27" } });
    expect(parse("currency=EURO")).toMatchObject({ errors: ["invalidCurrency"], filters: { currency: "EUR" } });
    expect(parse("threshold=-1").errors).toEqual(["invalidThreshold"]);
    expect(parse("threshold=1e3").errors).toEqual(["invalidThreshold"]);
    expect(parse("threshold=999999").errors).toEqual(["invalidThreshold"]);
    expect(parse("granularity=day").filters.granularity).toBe("month");
  });

  it("refuses ranges beyond the bucket cap", () => {
    expect(parse(`from=2000-01-01&to=2026-01-01&granularity=month`).errors).toEqual(["invalidRange"]);
    expect(parse(`from=2000-01-01&to=2026-01-01&granularity=year`).errors).toEqual([]);
    expect(bucketStarts("1900-01-01", "2026-01-01", "month").length).toBe(MAX_BUCKETS + 1);
  });

  it("reads the low-stock threshold from env with bounds", () => {
    expect(lowStockThresholdFromEnv(undefined)).toBe(5);
    expect(lowStockThresholdFromEnv(" 20 ")).toBe(20);
    expect(lowStockThresholdFromEnv("0")).toBe(0);
    expect(lowStockThresholdFromEnv("abc")).toBe(5);
    expect(lowStockThresholdFromEnv("1000000")).toBe(5);
  });
});
