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

  it("names the main SQL table after the pluralized entity (not the domain) and auxiliary tables after the singular entity, with --table override and collision guard", () => {
    const schema = (m: string) => readFileSync(join(dir, `modules/${m}/schema/index.ts`), 'utf8');
    expect(schema('event-tickets')).toContain('pgTable("tickets", {');
    expect(schema('event-tickets')).toContain('pgTable("ticket_revisions", {');
    expect(schema('event-tickets')).toContain('pgTable("ticket_locks", {');
    expect(schema('event-tickets')).toContain('uniqueIndex("tickets_org_slug_uidx")');
    expect(schema('event-tickets')).not.toContain('pgTable("event_tickets"');
    expect(schema('event-tickets')).toContain('index("ticket_revisions_resource_idx")');
    expect(schema('event-tickets')).not.toContain('tickets_revisions');
    run(['catalog', '--entity=category']);
    expect(schema('catalog')).toContain('pgTable("categories", {');
    expect(readFileSync(join(dir, 'modules/catalog/capabilities.ts'), 'utf8')).toContain('revisions: "category_revisions"');
    run(['boxes-shop', '--entity=box']);
    expect(schema('boxes-shop')).toContain('pgTable("boxes", {');
    run(['news', '--entity=news-item', '--table=news_entries']);
    expect(schema('news')).toContain('pgTable("news_entries", {');
    expect(schema('news')).toContain('pgTable("news_item_revisions", {');
    expect(schema('news')).toContain('pgTable("news_item_locks", {');
    // Table déjà déclarée par un autre module → refus, rien n'est écrit.
    expect(() => run(['other-tickets', '--entity=ticket'])).toThrow(/tickets/);
    expect(existsSync(join(dir, 'modules/other-tickets'))).toBe(false);
    expect(() => run(['bad-table', '--table=Bad-Name'])).toThrow();
  });

  it('--taxonomy opts the module into the generic core category taxonomy (tables, store, actions, capability, facet)', () => {
    run(['gizmos', '--entity=gizmo', '--taxonomy']);
    const read = (file: string) => readFileSync(join(dir, 'modules/gizmos', file), 'utf8');
    const schema = read('schema/index.ts');
    expect(schema).toContain('pgTable("gizmo_categories", {');
    expect(schema).toContain('pgTable("gizmo_category_translations", {');
    expect(schema).toContain('pgTable("gizmo_category_links", {');
    expect(schema).toContain('gizmoId: text("gizmo_id").notNull().references(() => gizmos.id, { onDelete: "cascade" })');
    expect(schema).toContain('primaryKey({ columns: [table.gizmoId, table.categoryId] })');
    expect(schema).toContain('check("gizmo_categories_no_self_parent"');
    const taxonomy = read('taxonomy.ts');
    expect(taxonomy).toContain('export const gizmosCategoryTaxonomy = registerCategoryTaxonomy(defineCategoryTaxonomy({');
    expect(taxonomy).toContain('linkResourceKey: "gizmoId"');
    expect(read('module.ts')).toContain('taxonomy: true,');
    expect(read('capabilities.ts')).toContain('taxonomy: "gizmo_categories (core/taxonomy, gizmosCategoryTaxonomy)"');
    expect(read('actions/index.ts')).toContain('categories: defineCategoryActions(gizmosCategoryTaxonomy, "gizmos"),');
    expect(read('admin/resource.ts')).toContain('{ id: "category", kind: "select", queryParam: "categoryId", facet: true }');
    const loader = read('loaders/gizmo-admin.loader.ts');
    expect(loader).toContain('categoryId: categoryFilterFromUrl(filters.category)');
    expect(loader).toContain('gizmosCategoryTaxonomy.filterCondition(organizationId, filters.categoryId)');
    expect(loader).toContain('gizmosCategoryTaxonomy.facet<GizmosAdminFilters>("categoryId", organizationId,');
    expect(readFileSync(join(dir, 'components/gizmos/admin/GizmosAdminList.astro'), 'utf8')).toContain('facets.category ?? []');
    // Sans le drapeau : aucune taxonomie (opt-in).
    expect(existsSync(join(dir, 'modules/event-tickets/taxonomy.ts'))).toBe(false);
    expect(readFileSync(join(dir, 'modules/event-tickets/module.ts'), 'utf8')).toContain('taxonomy: false,');
    expect(readFileSync(join(dir, 'modules/event-tickets/schema/index.ts'), 'utf8')).not.toContain('_categories');
    // Collision : une table de catégories déjà déclarée bloque la génération.
    expect(() => run(['gizmos-bis', '--entity=gizmo', '--table=gizmos_bis', '--taxonomy'])).toThrow(/gizmo_categories/);
  });

  it('refuses invalid names and existing modules', () => {
    expect(() => run(['Bad_Name'])).toThrow();
    expect(() => run(['event-tickets'])).toThrow();
  });

  it('scaffolds the core Effect stack: schema, workflow, lock, permission guard, service, loader, actions', () => {
    const base = join(dir, 'modules/event-tickets');
    const read = (file: string) => readFileSync(join(base, file), 'utf8');
    expect(read('locks.ts')).toContain('defineLockResource("event-tickets", drizzleLockStore("event-tickets", ticketLocks, "resourceId"), {');
    expect(read('locks.ts')).toContain('tenantOf: (id) =>');
    expect(read('refunds.ts')).toContain('export const EVENT_TICKETS_PAYMENT_PURPOSE = "event-tickets";');
    expect(read('refunds.ts')).toContain('registerRefundHandler({ purpose: EVENT_TICKETS_PAYMENT_PURPOSE, validate: validateRefund, onSucceeded: onRefundSucceeded })');
    expect(read('refunds.ts')).toContain('eq(eventTickets.organizationId, organizationId)');
    expect(readFileSync(join(dir, 'components/event-tickets/admin/EventTicketsAdminList.astro'), 'utf8')).toContain('<ForceReleaseLockButton resourceType="event-tickets"');
    expect(read('domain/workflow.ts')).toContain('export const eventTicketsWorkflow: WorkflowDefinition<EventTicketsStatus>');
    const perms = read('permissions/index.ts');
    expect(perms).toContain('requireTenantPermission(context, { "event-tickets": [...permissions] }, organizationId)');
    expect(perms).toContain('requireTenantResourcePermission(context, { "event-tickets": [...permissions] }, () =>');
    expect(perms).toContain('.from(eventTickets).where(eq(eventTickets.id, id))');
    const service = read('services/ticket.service.ts');
    expect(service).toContain('eventTicketsLock.ensureNotLockedByOther');
    expect(service).toContain('canTransition(eventTicketsWorkflow');
    expect(service).toContain('dbTry("event-tickets.update"');
    expect(read('loaders/ticket.loader.ts')).toContain('runOrThrow(eventTicketsLoader.byId(id, viewerId))');
    const actions = read('actions/index.ts');
    expect(actions).toContain('yield* requireEventTicketsPermission(context, ["create"], input.organizationId)');
    expect(actions).toContain('yield* requireEventTicketsResourcePermission(context, ["update"], id)');
    expect(actions).toContain('yield* requireEventTicketsResourcePermission(context, ["update"], input.id)');
    expect(read('module.ts')).toMatch(/locks: true,[\s\S]*/);
    // Actions groupées (core/bulk) : action générée, ressource activée, barre générique dans la liste.
    const bulk = read('actions/bulk.ts');
    expect(bulk).toContain('requireEventTicketsPermission(context, [PERMISSION[op]], input.organizationId)');
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

  it('type-checks against core abstractions (incl. --taxonomy) and passes the capability contract', async () => {
    // Les types Astro (`astro:actions`, `.astro/types.d.ts`) sont générés : en CI (checkout neuf)
    // ils n'existent pas tant que `astro sync` n'a pas tourné — le test les génère lui-même.
    if (!existsSync(join(repo, '.astro/types.d.ts'))) {
      execFileSync(resolve(repo, 'node_modules/.bin/astro'), ['sync'], { cwd: repo, encoding: 'utf8', stdio: 'pipe' });
    }
    execFileSync(tsx, [script, 'demo-items', '--entity=demo-item', '--taxonomy', `--root=${join(genDir, 'src')}`], { encoding: 'utf8', stdio: 'pipe' });
    const rootConfig = JSON.parse(readFileSync(join(repo, 'tsconfig.json'), 'utf8')) as { compilerOptions: { paths: Record<string, string[]> } };
    const tsconfig = {
      extends: '../tsconfig.json',
      // TS 6 : `baseUrl` est déprécié (TS5101) — les `paths` sont résolus relativement à ce tsconfig.
      compilerOptions: { noEmit: true, paths: { '@/modules/demo-items/*': ['./src/modules/demo-items/*'], ...Object.fromEntries(Object.entries(rootConfig.compilerOptions.paths).map(([k, v]) => [k, v.map((p) => `../${p}`)])) } },
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
    expect(mod.demoItemsModule.capabilities).toMatchObject({ locks: true, revisions: true, publication: true, taxonomy: true });
  }, 120_000);
});
