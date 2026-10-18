import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { splitSqlStatements, DDL_ALREADY_EXISTS_CODES } from "@database/commands/_migration-sql";

describe("splitSqlStatements", () => {
  it("splits plain statements separated only by the breakpoint marker", () => {
    const sql = "CREATE TABLE a (id text);\n--> statement-breakpoint\nCREATE TABLE b (id text);";
    expect(splitSqlStatements(sql)).toEqual([
      "CREATE TABLE a (id text);",
      "CREATE TABLE b (id text);",
    ]);
  });

  it("splits multiple statements chained without a breakpoint between them", () => {
    const sql = 'CREATE INDEX "a_idx" ON "a" ("id");\nCREATE INDEX "b_idx" ON "b" ("id");';
    expect(splitSqlStatements(sql)).toEqual([
      'CREATE INDEX "a_idx" ON "a" ("id");',
      'CREATE INDEX "b_idx" ON "b" ("id");',
    ]);
  });

  it("keeps working when the marker is glued directly after a semicolon on the same line", () => {
    const sql = 'ALTER TABLE "a" DROP COLUMN "b";--> statement-breakpoint\nALTER TABLE "a" ADD COLUMN "c" text;';
    expect(splitSqlStatements(sql)).toEqual([
      'ALTER TABLE "a" DROP COLUMN "b";',
      'ALTER TABLE "a" ADD COLUMN "c" text;',
    ]);
  });

  it("does not split inside a DO $$ ... $$ block on internal semicolons (regression: 0005 migration failure)", () => {
    const sql = [
      "DO $$",
      "BEGIN",
      '  IF EXISTS (SELECT 1 FROM "a") THEN',
      "    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'blocked';",
      "  END IF;",
      "END",
      "$$;",
      "--> statement-breakpoint",
      'CREATE TABLE "after" (id text);',
    ].join("\n");

    const statements = splitSqlStatements(sql);

    expect(statements).toHaveLength(2);
    expect(statements[0].trim().startsWith("DO $$")).toBe(true);
    expect(statements[0].trim().endsWith("$$;")).toBe(true);
    expect(statements[0]).toContain("RAISE EXCEPTION");
    expect(statements[1]).toBe('CREATE TABLE "after" (id text);');
  });

  it("does not split inside a CREATE FUNCTION body using a tagged dollar-quote", () => {
    const sql = [
      'CREATE OR REPLACE FUNCTION "f"() RETURNS trigger AS $body$',
      "BEGIN",
      "  NEW.x := 'a;b';",
      "  RETURN NEW;",
      "END;",
      "$body$ LANGUAGE plpgsql;",
    ].join("\n");

    const statements = splitSqlStatements(sql);

    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("NEW.x := 'a;b';");
    expect(statements[0].trim().endsWith("$body$ LANGUAGE plpgsql;")).toBe(true);
  });

  it("does not split on a semicolon inside a quoted string literal", () => {
    const sql = "INSERT INTO \"a\" (\"b\") VALUES ('x;y');\nINSERT INTO \"a\" (\"b\") VALUES ('z');";
    expect(splitSqlStatements(sql)).toEqual([
      "INSERT INTO \"a\" (\"b\") VALUES ('x;y');",
      "INSERT INTO \"a\" (\"b\") VALUES ('z');",
    ]);
  });

  it("handles an escaped '' quote inside a string literal without breaking the block", () => {
    const sql = "INSERT INTO \"a\" (\"b\") VALUES ('it''s; fine');";
    expect(splitSqlStatements(sql)).toEqual([sql]);
  });

  it("ignores a semicolon inside a line comment", () => {
    const sql = '-- comment with a ; inside\nCREATE TABLE "a" (id text);';
    expect(splitSqlStatements(sql)).toEqual([sql]);
  });

  it("every statement produced from every real migration file has balanced dollar-quote tags", () => {
    const dir = resolve(process.cwd(), "src/database/migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const statements = splitSqlStatements(readFileSync(resolve(dir, file), "utf8"));
      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements) {
        const tags = statement.match(/\$[A-Za-z_]*\$/g) ?? [];
        expect(tags.length % 2, `${file}: unbalanced dollar-quote in:\n${statement}`).toBe(0);
      }
    }
  });

  it("every statement produced from every real infra file has balanced dollar-quote tags", () => {
    const dir = resolve(process.cwd(), "src/database/infra");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const statements = splitSqlStatements(readFileSync(resolve(dir, file), "utf8"));
      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements) {
        const tags = statement.match(/\$[A-Za-z_]*\$/g) ?? [];
        expect(tags.length % 2, `${file}: unbalanced dollar-quote in:\n${statement}`).toBe(0);
      }
    }
  });

  it("never produces two 0007 services-search migration files (regression: duplicate migration)", () => {
    const dir = resolve(process.cwd(), "src/database/migrations");
    const files = readdirSync(dir).filter((f) => /^0007_/.test(f));
    expect(files).toEqual(["0007_services_search_vector.sql"]);
  });
});

describe("DDL_ALREADY_EXISTS_CODES", () => {
  it("only tolerates DDL 'already exists' codes, never data-integrity codes", () => {
    expect([...DDL_ALREADY_EXISTS_CODES].sort()).toEqual(["42701", "42710", "42P07"].sort());
    expect(DDL_ALREADY_EXISTS_CODES.has("23505")).toBe(false); // unique_violation must never be swallowed
    expect(DDL_ALREADY_EXISTS_CODES.has("23514")).toBe(false); // check_violation must never be swallowed
  });
});
