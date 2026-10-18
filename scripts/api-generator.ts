/**
 * Générateur CRUD depuis les schémas Drizzle — idée reprise de moda
 * (`scripts/api-generator.ts`), réécrite en non interactif et sécurisée :
 *
 *   pnpm api:generate <exportName> [--list=role:admin] [--read=role:admin]
 *                     [--create=disabled] [--update=disabled] [--delete=disabled]
 *                     [--out=src/generated/crud] [--dry-run]
 *   pnpm api:generate --list-tables
 *
 * Produit `src/generated/crud/<id>.ts` (définition + table) et régénère
 * l'index consommé par `/api/crud/<id>` et l'autopage admin
 * `/[lang]/admin/crud/<id>`. Par défaut, seules la liste et la lecture sont
 * ouvertes, et uniquement au rôle admin. Les tables d'authentification et de
 * sécurité sont refusées ; les colonnes sensibles (password, token, secret…)
 * ne sont jamais exposées.
 */
import { mkdirSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isTable } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import * as schemas from "../src/database/schemas";
import { introspectTable } from "../src/core/crud/introspect";
import { CRUD_ACTIONS, parseAccessRule, type CrudAction, type CrudAccessRule } from "../src/core/crud/contract";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const outDir = resolve(process.cwd(), flag("out") ?? "src/generated/crud");
const dryRun = args.includes("--dry-run");

const tables = Object.entries(schemas).filter(([, v]) => isTable(v)) as [string, PgTable][];

if (args.includes("--list-tables")) {
  for (const [name] of tables) console.log(name);
  process.exit(0);
}

const exportName = args.find((a) => !a.startsWith("--"));
if (!exportName) {
  console.error("usage: pnpm api:generate <exportName> [--list=…] [--read=…] [--create=…] [--update=…] [--delete=…] [--dry-run]");
  process.exit(1);
}
const entry = tables.find(([name]) => name === exportName);
if (!entry) {
  console.error(`Table Drizzle introuvable : ${exportName} (voir --list-tables)`);
  process.exit(1);
}

const access: Partial<Record<CrudAction, CrudAccessRule>> = {};
for (const action of CRUD_ACTIONS) {
  const raw = flag(action);
  if (raw) access[action] = parseAccessRule(raw);
}

let definition;
try {
  definition = introspectTable(entry[1], exportName, access);
} catch (err) {
  console.error(`Refusé : ${(err as Error).message}`);
  process.exit(1);
}

const constName = `${exportName}Crud`;
const file = `// Généré par \`pnpm api:generate ${exportName}\` — relancer le générateur plutôt que d'éditer.
import { ${exportName} } from "@database/schemas";
import type { CrudRegistration } from "@/core/crud/engine";

export const ${constName}: CrudRegistration = {
  table: ${exportName},
  definition: ${JSON.stringify(definition, null, 2).replace(/\n/g, "\n  ")},
};
`;

if (dryRun) {
  console.log(file);
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${definition.id}.ts`), file, "utf8");

// Régénère l'index à partir des fichiers présents.
const entries = readdirSync(outDir)
  .filter((f) => f.endsWith(".ts") && f !== "index.ts")
  .map((f) => {
    const content = readFileSync(join(outDir, f), "utf8");
    const name = /export const (\w+): CrudRegistration/.exec(content)?.[1];
    return name ? { id: f.replace(/\.ts$/, ""), name } : null;
  })
  .filter((v): v is { id: string; name: string } => v !== null)
  .sort((a, b) => a.id.localeCompare(b.id));

const index = `// Généré par \`pnpm api:generate\` — index des ressources CRUD.
import type { CrudRegistration } from "@/core/crud/engine";
${entries.map((e) => `import { ${e.name} } from "./${e.id}";`).join("\n")}

export const crudResources: Record<string, CrudRegistration> = {
${entries.map((e) => `  "${e.id}": ${e.name},`).join("\n")}
};
`;
writeFileSync(join(outDir, "index.ts"), index, "utf8");
console.log(`✔ ${join(outDir, `${definition.id}.ts`)} — /api/crud/${definition.id}`);
console.log(`  accès : ${Object.entries(definition.access).map(([a, r]) => `${a}=${r}`).join(" ")}`);
