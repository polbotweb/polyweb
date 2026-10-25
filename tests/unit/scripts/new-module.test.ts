import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
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

  it('scaffolds the core Effect stack: schema, workflow, lock, permission guard, service, loader, actions', () => {
    const base = join(dir, 'modules/event-tickets');
    const read = (file: string) => readFileSync(join(base, file), 'utf8');
    expect(read('locks.ts')).toContain('defineLockResource("event-tickets", drizzleLockStore("event-tickets", eventTicketsLocks, "resourceId"), {');
    expect(read('locks.ts')).toContain('tenantOf: (id) =>');
    expect(readFileSync(join(dir, 'components/event-tickets/admin/EventTicketsAdminList.astro'), 'utf8')).toContain('<ForceReleaseLockButton resourceType="event-tickets"');
    expect(read('domain/workflow.ts')).toContain('export const eventTicketsWorkflow: WorkflowDefinition<EventTicketsStatus>');
    expect(read('permissions/index.ts')).toContain('requireActionPermission(context, { "event-tickets": [...permissions] })');
    const service = read('services/ticket.service.ts');
    expect(service).toContain('eventTicketsLock.ensureNotLockedByOther');
    expect(service).toContain('canTransition(eventTicketsWorkflow');
    expect(service).toContain('dbTry("event-tickets.update"');
    expect(read('loaders/ticket.loader.ts')).toContain('runOrThrow(eventTicketsLoader.byId(id, viewerId))');
    expect(read('actions/index.ts')).toContain('yield* requireEventTicketsPermission(context, ["update"])');
    expect(read('module.ts')).toMatch(/locks: true,[\s\S]*/);
    // Actions groupées (core/bulk) : action générée, ressource activée, barre générique dans la liste.
    const bulk = read('actions/bulk.ts');
    expect(bulk).toContain('runBulkAction({');
    expect(bulk).toContain('eventTicketsLock.ensureNoneLockedByOther');
    expect(bulk).toContain('canTransition(eventTicketsWorkflow');
    expect(read('actions/index.ts')).toContain('bulk: bulkEventTicketsLifecycle,');
    const resource = read('admin/resource.ts');
    expect(resource).toContain('bulk: true,');
    expect(resource).toContain('{ id: "archive", permission: "event-tickets:update", confirmationKey: "event-tickets.bulk.archive" }');
    const list = readFileSync(join(dir, 'components/event-tickets/admin/EventTicketsAdminList.astro'), 'utf8');
    expect(list).toContain('<AdminBulkBar action="eventTickets.bulk"');
    expect(list).toContain('data-bulk-item value={item.id}');
    // Facettes + vues enregistrées (core/filters) : filtre statut facetté, loader Effect, liste branchée.
    expect(resource).toContain('{ id: "status", kind: "select", queryParam: "status", options: [...EVENT_TICKETS_STATUSES], facet: true }');
    expect(resource).toMatch(/facets: true,\s*savedViews: true,/);
    const adminLoader = read('loaders/ticket-admin.loader.ts');
    expect(adminLoader).toContain('computeFacets(filters, [');
    expect(adminLoader).toContain('parseListUrlState(ticketAdminResource.list!, params)');
    expect(read('loaders/index.ts')).toContain('export * from "./ticket-admin.loader";');
    expect(list).toContain('<AdminFacets locale={locale} groups={facetGroups}');
    expect(list).toContain('<AdminSavedViews locale={locale} resource="ticket"');
  });
});

/**
 * « Build » d'un module généré : génération dans le dépôt (dossier ignoré `tmp*`),
 * puis `tsc --noEmit` strict sur tous ses fichiers TypeScript contre le vrai code
 * core (alias `@/modules/<nom>/*` redirigé vers le module généré), et chargement
 * réel de `module.ts` (le contrat de capacités est vérifié à l'import).
 */
describe('scripts/new-module.ts — module généré compilable', () => {
  const repo = process.cwd();
  const genDir = mkdtempSync(join(repo, 'tmp-new-module-'));
  afterAll(() => rmSync(genDir, { recursive: true, force: true }));

  it('type-checks against core abstractions and passes the capability contract', async () => {
    // Les types Astro (`astro:actions`, `.astro/types.d.ts`) sont générés : en CI (checkout neuf)
    // ils n'existent pas tant que `astro sync` n'a pas tourné — le test les génère lui-même.
    if (!existsSync(join(repo, '.astro/types.d.ts'))) {
      execFileSync(resolve(repo, 'node_modules/.bin/astro'), ['sync'], { cwd: repo, encoding: 'utf8', stdio: 'pipe' });
    }
    execFileSync(tsx, [script, 'demo-items', '--entity=demo-item', `--root=${join(genDir, 'src')}`], { encoding: 'utf8', stdio: 'pipe' });
    const rootConfig = JSON.parse(readFileSync(join(repo, 'tsconfig.json'), 'utf8')) as { compilerOptions: { paths: Record<string, string[]> } };
    const rel = genDir.slice(repo.length + 1);
    const tsconfig = {
      extends: '../tsconfig.json',
      compilerOptions: { noEmit: true, baseUrl: '..', paths: { '@/modules/demo-items/*': [`${rel}/src/modules/demo-items/*`], ...rootConfig.compilerOptions.paths } },
      include: ['src/modules/**/*.ts', '../src/env.d.ts', '../.astro/types.d.ts'],
    };
    writeFileSync(join(genDir, 'tsconfig.json'), JSON.stringify(tsconfig));
    const tsc = resolve(repo, 'node_modules/.bin/tsc');
    let output = '';
    try {
      execFileSync(tsc, ['-p', join(genDir, 'tsconfig.json')], { encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      output = String((error as { stdout?: string }).stdout ?? error);
    }
    expect(output).toBe('');
    const mod = (await import(join(genDir, 'src/modules/demo-items/module.ts'))) as { demoItemsModule: { capabilities: Record<string, boolean> } };
    expect(mod.demoItemsModule.capabilities).toMatchObject({ locks: true, revisions: true, publication: true });
  }, 120_000);
});
