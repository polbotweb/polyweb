import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve(process.cwd(), 'scripts/new-module.ts');
const tsx = resolve(process.cwd(), 'node_modules/.bin/tsx');
const dir = mkdtempSync(join(tmpdir(), 'polyweb-new-module-'));

function run(args: string[]) {
  return execFileSync(tsx, [script, ...args, `--root=${dir}`], { encoding: 'utf8', stdio: 'pipe' });
}

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('scripts/new-module.ts', () => {
  it('generates a module with valid camelCase identifiers for kebab names', () => {
    run(['event-tickets', '--entity=ticket']);
    const moduleFile = readFileSync(join(dir, 'modules/event-tickets/module.ts'), 'utf8');
    expect(moduleFile).toContain('export const eventTicketsModule: PolywebModuleDefinition');
    expect(moduleFile).toContain('id: "event-tickets"');
    expect(existsSync(join(dir, 'modules/event-tickets/loaders/ticket.loader.ts'))).toBe(true);
    expect(readFileSync(join(dir, 'modules/event-tickets/admin/resource.ts'), 'utf8')).toContain('ticketAdminResource');
    expect(existsSync(join(dir, 'components/event-tickets/EventTicketsCard.astro'))).toBe(true);
  });

  it('refuses invalid names and existing modules', () => {
    expect(() => run(['Bad_Name'])).toThrow();
    expect(() => run(['event-tickets'])).toThrow();
  });
});
