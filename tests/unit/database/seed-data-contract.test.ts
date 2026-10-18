import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getTableColumns } from "drizzle-orm";
import * as schemas from "@database/schemas";
import { seedManifest } from "@database/data/manifest";

describe("seed data contract", () => {
  it("maps every manifest entry to an existing non-empty dataset and schema table", async () => {
    for (const entry of seedManifest) {
      const filePath = resolve(process.cwd(), "src/database/data", entry.dataFile);
      expect(existsSync(filePath), `Missing seed file: ${entry.dataFile}`).toBe(true);

      const schema = schemas[entry.schemaExport as keyof typeof schemas];
      expect(schema, `Missing schema export: ${entry.schemaExport}`).toBeDefined();

      const module = await import(pathToFileURL(filePath).href);
      const dataset = module.default;
      expect(Array.isArray(dataset), `${entry.dataFile} must default-export an array`).toBe(true);
      expect(dataset.length, `${entry.dataFile} must not be empty`).toBeGreaterThan(0);

      const columns = new Set(Object.keys(getTableColumns(schema as Parameters<typeof getTableColumns>[0])));
      for (const row of dataset as Record<string, unknown>[]) {
        for (const key of Object.keys(row)) {
          expect(columns.has(key), `${entry.dataFile}: ${entry.schemaExport} has no column '${key}'`).toBe(true);
        }
      }
    }
  });

  it("uses unique data filenames and schema exports", () => {
    expect(new Set(seedManifest.map((entry) => entry.dataFile)).size).toBe(seedManifest.length);
    expect(new Set(seedManifest.map((entry) => entry.schemaExport)).size).toBe(seedManifest.length);
  });
});
