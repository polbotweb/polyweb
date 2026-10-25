import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PATHS = {
  root:       path.resolve(__dirname, '../'),
  src:        path.resolve(__dirname, '../src'),
  components: path.resolve(__dirname, '../src/components'),
  core:       path.resolve(__dirname, '../src/core'),
  modules:    path.resolve(__dirname, '../src/modules'),
  styles:     path.resolve(__dirname, '../src/styles'),
  assets:     path.resolve(__dirname, '../src/assets'),
  database:   path.resolve(__dirname, '../src/database'),
  schemas:    path.resolve(__dirname, '../src/database/schemas'),
  lib:        path.resolve(__dirname, '../src/lib'),
  actions:    path.resolve(__dirname, '../src/actions'),
  media:      path.resolve(__dirname, '../src/media'),
  smtp:       path.resolve(__dirname, '../src/smtp'),
  i18nDir:    path.resolve(__dirname, '../src/i18n'),
  pages:      path.resolve(__dirname, '../src/pages'),
  layouts:    path.resolve(__dirname, '../src/layouts'),
  tests:      path.resolve(__dirname, '../tests'),
  github:     path.resolve(__dirname, '../.github'),
  logs:       path.resolve(__dirname, '../logs'),
  public:     path.resolve(__dirname, '../public'),
  packageJson: path.resolve(__dirname, '../package.json'),
  envExample:  path.resolve(__dirname, '../.env.example'),
  tsconfig:    path.resolve(__dirname, '../tsconfig.json'),
};

export async function listTree(dir: string, depth = 0, maxDepth = 3): Promise<string> {
  if (depth > maxDepth) return '';
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let result = '';
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const indent = '  '.repeat(depth);
      if (entry.isDirectory()) {
        result += `${indent}${entry.name}/\n`;
        result += await listTree(path.join(dir, entry.name), depth + 1, maxDepth);
      } else {
        result += `${indent}${entry.name}\n`;
      }
    }
    return result;
  } catch {
    return '';
  }
}

export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

export async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter(e => e.isFile()).map(e => e.name);
  } catch {
    return [];
  }
}

/**
 * Returns a markdown table of scripts whose names match any of the given prefixes.
 * Matches exact name, or name starting with `prefix:` or `prefix-`.
 */
export async function getScriptsByPrefix(prefixes: string[]): Promise<string> {
  const content = await readFile(PATHS.packageJson);
  if (!content) return '';
  const pkg = JSON.parse(content);
  const scripts = Object.entries(pkg.scripts || {}) as [string, string][];
  const filtered = scripts.filter(([name]) =>
    prefixes.some(p => name === p || name.startsWith(p + ':') || name.startsWith(p + '-'))
  );
  if (filtered.length === 0) return '';
  const rows = filtered.map(([name]) => `| \`pnpm ${name}\` |`).join('\n');
  return `| Command |\n|---------|\n${rows}`;
}

/**
 * Walks tests/ and returns relative paths of test files whose filename
 * contains at least one of the given patterns.
 */
export async function findTestsByPattern(patterns: string[]): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string) {
    let entries: import('fs').Dirent[];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (/\.(test|spec)\.(ts|js)$/.test(e.name) && patterns.some(p => e.name.includes(p)))
        results.push(path.relative(PATHS.root, full).replace(/\\/g, '/'));
    }
  }
  await walk(PATHS.tests);
  return results;
}

/**
 * Like findTestsByPattern but deduplicates across sections:
 * skips tests already present in `assigned`, then adds the fresh ones.
 */
export async function claimTestsByPattern(patterns: string[], assigned: Set<string>): Promise<string[]> {
  const all = await findTestsByPattern(patterns);
  const fresh = all.filter(f => !assigned.has(f));
  for (const f of fresh) assigned.add(f);
  return fresh;
}
