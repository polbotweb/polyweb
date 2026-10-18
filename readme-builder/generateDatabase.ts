import { listFiles, readFile, PATHS, listTree, getScriptsByPrefix, claimTestsByPattern } from './utils';
import path from 'path';
import { i18n, type Lang } from './i18n';

/**
 * Extracts pgTable definitions using brace-counting instead of a lazy regex,
 * which correctly handles nested objects like .references(() => t.id, { onDelete: 'cascade' }).
 */
function extractTableDefinitions(content: string): Array<{
  constName: string; tableName: string; fields: string[];
}> {
  const results: Array<{ constName: string; tableName: string; fields: string[] }> = [];
  const headerRe = /(?:export\s+)?const\s+(\w+)\s*=\s*pgTable\(\s*['"]([^'"]+)['"]\s*,\s*/g;
  let h: RegExpExecArray | null;

  while ((h = headerRe.exec(content)) !== null) {
    const pos = h.index + h[0].length;
    if (content[pos] !== '{') continue;

    // Balance braces to find the matching '}'
    let depth = 0, end = -1;
    for (let i = pos; i < content.length; i++) {
      const ch = content[i];
      if (ch === '{') depth++;
      else if (ch === '}') { if (--depth === 0) { end = i; break; } }
    }
    if (end === -1) continue;

    const block = content.slice(pos + 1, end);

    // Find field names at the minimum indentation level (= top-level fields only)
    const lines = block.split('\n');
    let minIndent = Infinity;
    for (const ln of lines) {
      const m = ln.match(/^(\s+)[a-zA-Z0-9_]+\s*:/);
      if (m) minIndent = Math.min(minIndent, m[1].length);
    }

    const fields: string[] = [];
    if (minIndent !== Infinity) {
      for (const ln of lines) {
        const m = ln.match(/^(\s+)([a-zA-Z0-9_]+)\s*:/);
        if (m && m[1].length === minIndent) fields.push(m[2]);
      }
    }

    results.push({ constName: h[1], tableName: h[2], fields });
    headerRe.lastIndex = end + 1;
  }
  return results;
}

export async function generateDatabase(lang: Lang = 'en', assigned: Set<string> = new Set()): Promise<string> {
  const s = i18n.sections;
  const sub = i18n.subsections;

  let section = `## ${s.database[lang]}\n\n`;

  // ── Files ────────────────────────────────────────────────────────────────
  section += `### ${sub.files[lang]}\n\n`;
  section += '```\n';
  const dbTree = await listTree(PATHS.database, 0, 2);
  if (dbTree) section += `src/database/\n${dbTree}`;
  section += '```\n\n';

  // ── Schemas & Tables ─────────────────────────────────────────────────────
  section += `### ${sub.schemas[lang]}\n\n`;

  const barrelPath = path.join(PATHS.schemas, '..', 'schemas.ts');
  const schemaFiles = (await listFiles(PATHS.schemas)).filter(f => f.endsWith('.ts'));
  const barrelContent = await readFile(barrelPath);

  const exportRegex = /export\s*\*\s*from\s*['"]\.\/schemas\/([^'"]+)['"]/g;
  const exportedFiles: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = exportRegex.exec(barrelContent)) !== null) {
    let file = match[1];
    if (!file.endsWith('.ts')) file += '.ts';
    exportedFiles.push(file);
  }

  const normalize = (f: string) =>
    f.replace(/\.schema/, '').replace(/\.ts$/, '').replace(/[-_]/g, '').toLowerCase();

  const schemaMap = new Map<string, string>();
  for (const f of schemaFiles) schemaMap.set(normalize(f), f);
  const exportedMap = new Map<string, string>();
  for (const f of exportedFiles) exportedMap.set(normalize(f), f);

  const realExportedFiles: string[] = [];
  for (const [norm] of exportedMap.entries()) {
    if (schemaMap.has(norm)) realExportedFiles.push(schemaMap.get(norm)!);
  }

  if (realExportedFiles.length === 0) {
    section += i18n.databaseNoExported[lang] + '\n\n';
  } else {
    // Parse relations (simple arrow-function bodies, no deeply nested braces)
    const relMap = new Map<string, { name: string; type: string }[]>();
    for (const file of realExportedFiles) {
      const content = await readFile(path.join(PATHS.schemas, file));
      const relRegex = /export\s+const\s+\w+Relations\s*=\s*relations\(\s*(\w+)\s*,[^=]*=>\s*\(\{([\s\S]*?)\}\)\s*\)/gm;
      let relMatch: RegExpExecArray | null;
      while ((relMatch = relRegex.exec(content)) !== null) {
        const tableVar = relMatch[1];
        const body = relMatch[2];
        const rels: { name: string; type: string }[] = [];
        const rfRe = /([a-zA-Z0-9_]+)\s*:\s*(one|many)\s*\(/g;
        let rf: RegExpExecArray | null;
        while ((rf = rfRe.exec(body)) !== null) rels.push({ name: rf[1], type: rf[2] });
        relMap.set(tableVar, rels);
      }
    }

    for (const file of realExportedFiles) {
      const content = await readFile(path.join(PATHS.schemas, file));
      const tables = extractTableDefinitions(content);

      if (tables.length > 0) {
        section += `**${file}**\n`;
        for (const t of tables) {
          const rels = (relMap.get(t.constName) ?? []);
          const relPart = rels.length > 0
            ? ` _(${rels.map(r => `${r.name}: ${r.type}`).join(', ')})_`
            : '';
          section += `- \`${t.tableName}\`: ${t.fields.map(f => `\`${f}\``).join(', ')}${relPart}\n`;
        }
        section += '\n';
      }
    }
  }

  // ── Migrations ───────────────────────────────────────────────────────────
  const migrationsDir = path.join(PATHS.database, 'migrations');
  const migrationFiles = (await listFiles(migrationsDir)).filter(f => f.endsWith('.sql')).sort();
  if (migrationFiles.length > 0) {
    section += `### ${sub.migrations[lang]}\n\n`;
    section += migrationFiles.map(f => `- \`${f}\``).join('\n') + '\n\n';
  }

  // ── Commands ─────────────────────────────────────────────────────────────
  const commands = await getScriptsByPrefix(['db']);
  if (commands) section += `### ${sub.commands[lang]}\n\n${commands}\n\n`;

  // ── Tests ────────────────────────────────────────────────────────────────
  const testFiles = await claimTestsByPattern([
    'db-env', 'db-health', 'cache', 'cli-utils', 'schema-validation',
    'cms-schemas', 'cms-seeds', 'loaders', 'navigation-loader',
    'site-loader', 'search-fts',
  ], assigned);
  if (testFiles.length > 0) {
    section += `### ${sub.tests[lang]}\n\n`;
    for (const f of testFiles) section += `- \`${f}\`\n`;
    section += '\n';
  }

  return section;
}