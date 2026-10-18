import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import path from "node:path";
import * as schemas from "@database/schemas";
import { seedManifest } from "@database/data/manifest";

const servicesEntries = seedManifest.filter((entry) => entry.dataFile.match(/^(24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40)/));

describe("Services seed data", () => {
  it("is complete, non-empty and structurally compatible with every Drizzle table", async () => {
    for (const entry of servicesEntries) {
      const table = schemas[entry.schemaExport as keyof typeof schemas];
      expect(table, `${entry.schemaExport} schema export`).toBeDefined();
      const module = await import(pathToFileURL(path.resolve(process.cwd(), "src/database/data", entry.dataFile)).href);
      const dataset = module.default as unknown;
      expect(Array.isArray(dataset), entry.dataFile).toBe(true);
      expect((dataset as unknown[]).length, entry.dataFile).toBeGreaterThan(0);

      const columns = new Set(Object.keys(getTableColumns(table as Parameters<typeof getTableColumns>[0])));
      for (const row of dataset as Record<string, unknown>[]) {
        for (const key of Object.keys(row)) {
          expect(columns.has(key), `${entry.dataFile}: unknown column ${key}`).toBe(true);
        }
      }
    }
  });
});
