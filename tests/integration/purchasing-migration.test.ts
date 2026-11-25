/**
 * Migration 0057 (factures, réassort, SEPA, approbations, lignes de prestation) :
 * journal, présence des tables sur la base de test, puis down → up sur une base
 * jetable (jamais de verrou exclusif sur la base de test partagée, pour éviter
 * les interblocages 40P01 avec les autres fichiers d'intégration).
 *
 * Le down retire d'abord les lignes de prestation (`item_id` nul ou `kind <> 'stock'`)
 * et leurs lignes de réception, contraintes rendues immédiates, afin que
 * `item_id SET NOT NULL` réussisse. Perte volontaire de ces lignes à la descente,
 * documentée dans `down/0057_purchasing_invoices_reorder.down.sql`.
 */
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { sql } from "drizzle-orm";
import { getDrizzle } from "@/database/drizzle";
import { splitSqlStatements } from "@database/commands/_migration-sql";
import { execFileSync } from "node:child_process";
import "dotenv/config";

const dir = resolve(process.cwd(), "src/database/migrations");
const up = splitSqlStatements(readFileSync(resolve(dir, "0057_purchasing_invoices_reorder.sql"), "utf8"));
const down = splitSqlStatements(readFileSync(resolve(dir, "down/0057_purchasing_invoices_reorder.down.sql"), "utf8"));
/** Migrations postérieures (0058+) : descendues avant 0057 puis remontées après (dépendances FK). */
const later = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) > 57).sort();
const laterUp = later.map((f) => splitSqlStatements(readFileSync(resolve(dir, f), "utf8")));
const laterDown = later.map((f) => splitSqlStatements(readFileSync(resolve(dir, "down", f.replace(/\.sql$/, ".down.sql")), "utf8"))).reverse();
const journal = JSON.parse(readFileSync(resolve(dir, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string; when: number }[] };

const expected = [
  "approval_policies", "approval_bands", "approval_requests", "approval_steps",
  "purchasing_settings", "purchasing_email_templates", "purchasing_invoices", "purchasing_invoice_lines",
  "purchasing_payments", "purchasing_reorder_rules", "purchasing_returns", "purchasing_sepa_exports",
  "purchasing_einvoice_imports", "purchasing_punchout_sessions",
];

const listed = expected.map((name) => `'${name}'`).join(", ");
const tablesSql = `select table_name from information_schema.tables where table_schema = 'public' and table_name in (${listed}) order by 1`;

const base = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL_LOCAL ?? "";
const scratchName = `polyweb_po57_${Date.now().toString(36)}`;
const adminUrl = Object.assign(new URL(base), { pathname: "/postgres" }).toString();
const scratchUrl = Object.assign(new URL(base), { pathname: `/${scratchName}` }).toString();

const admin = () => new pg.Client({ connectionString: adminUrl });
const withScratch = async <T>(fn: (c: pg.Client) => Promise<T>) => {
  const c = new pg.Client({ connectionString: scratchUrl });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
};

describe("migration 0057 purchasing", () => {
  it("journal : 0057 après 0056 (ordre du migrateur)", () => {
    const e56 = journal.entries.find((e) => e.idx === 56)!;
    const e57 = journal.entries.find((e) => e.idx === 57)!;
    expect(e57.tag).toBe("0057_purchasing_invoices_reorder");
    expect(e57.when).toBeGreaterThan(e56.when);
  });

  it("tables 0057 présentes sur la base de test", async () => {
    const found = await getDrizzle().execute(sql.raw(tablesSql));
    const names = new Set((found.rows as { table_name: string }[]).map((row) => row.table_name));
    expect([...expected].sort()).toEqual([...names].sort());
  });

  describe("down puis up (base jetable)", () => {
    beforeAll(async () => {
      const c = admin();
      await c.connect();
      try { await c.query(`CREATE DATABASE ${scratchName}`); } finally { await c.end(); }
      execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/database/commands/db.migrate.ts"], {
        env: { ...process.env, DB_ENV: "LOCAL", DATABASE_URL_LOCAL: scratchUrl, DATABASE_URL_TEST: scratchUrl, NODE_ENV: "test" },
        stdio: "pipe",
      });
    }, 180_000);

    afterAll(async () => {
      const c = admin();
      await c.connect();
      try { await c.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`); } finally { await c.end(); }
    }, 30_000);

    it("rejoue le down puis l'up, y compris avec une ligne de prestation", async () => {
      await withScratch(async (c) => {
        const before = (await c.query(tablesSql)).rows.map((row) => row.table_name);
        expect(before).toEqual([...expected].sort());

        const suffix = `m57${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
        const supplierId = crypto.randomUUID();
        const warehouseId = crypto.randomUUID();
        const orderId = crypto.randomUUID();
        const lineId = crypto.randomUUID();
        await c.query("insert into logistics_warehouses (id, code, name) values ($1, $2, $3)", [warehouseId, `W${suffix}`, "Entrepôt 0057"]);
        await c.query("insert into purchasing_suppliers (id, code, name) values ($1, $2, $3)", [supplierId, `S${suffix}`, "Fournisseur 0057"]);
        await c.query("insert into purchasing_orders (id, slug, title, status, supplier_id, warehouse_id, currency) values ($1, $2, $3, $4, $5, $6, $7)", [orderId, suffix, "Commande 0057", "DRAFT", supplierId, warehouseId, "EUR"]);
        await c.query("insert into purchasing_order_lines (id, order_id, position, item_id, sku, kind, quantity, unit_price_minor, net_minor) values ($1, $2, 1, null, $3, $4, 1, 1000, 1000)", [lineId, orderId, "SVC-1", "service"]);

        await c.query("BEGIN");
        try {
          for (const statements of laterDown) for (const statement of statements) await c.query(statement);
          for (const statement of down) await c.query(statement);
          expect((await c.query(tablesSql)).rows).toEqual([]);
          expect((await c.query("select id from purchasing_order_lines where id = $1", [lineId])).rows).toEqual([]);
          for (const statement of up) await c.query(statement);
          for (const statements of laterUp) for (const statement of statements) await c.query(statement);
          expect((await c.query(tablesSql)).rows.map((row) => row.table_name)).toEqual(before);
        } finally {
          await c.query("ROLLBACK");
        }
      });
    }, 30_000);
  });
});
