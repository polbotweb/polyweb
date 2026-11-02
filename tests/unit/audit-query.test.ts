import { describe, expect, it } from 'vitest';
import { auditCsv, csvCell, parseAuditFilters, AUDIT_CSV_HEADER } from '@/core/audit/query';
import { isAssignableSiteRole } from '@/core/permissions/site-access';
import { getModuleLabel, isModuleId } from '@/core/localization/module-labels';

describe('parseAuditFilters', () => {
  it('lit les filtres valides et borne les dates au jour (UTC, fin exclusive)', () => {
    const f = parseAuditFilters(new URLSearchParams('action=crm.permission&module=crm&outcome=denied&from=2026-01-01&to=2026-01-31&page=3'));
    expect(f).toMatchObject({ action: 'crm.permission', module: 'crm', outcome: 'denied', page: 3 });
    expect(f.from?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(f.to?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('ignore les valeurs invalides ou hostiles (pas d’organisation dans les filtres)', () => {
    const f = parseAuditFilters(new URLSearchParams("action=%27%3Bdrop&module=a%20b&outcome=hacked&from=2026-13-99&to=x&page=-2&organizationId=other"));
    expect(f).toEqual({ action: undefined, module: undefined, outcome: undefined, from: undefined, to: undefined, page: 1 });
    expect('organizationId' in f).toBe(false);
  });
});

describe('CSV', () => {
  it('neutralise les formules de tableur et double les guillemets', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    for (const p of ['+', '-', '@', '\t']) expect(csvCell(`${p}1`).startsWith(`"'`)).toBe(true);
    expect(csvCell(null)).toBe('""');
    expect(csvCell(new Date('2026-01-01T00:00:00Z'))).toBe('"2026-01-01T00:00:00.000Z"');
  });

  it('produit un en-tête stable, un BOM et des lignes CRLF', () => {
    const csv = auditCsv([{ id: '1', createdAt: new Date('2026-01-01T00:00:00Z'), action: 'org.site_access.grant', module: 'org', outcome: 'success', userName: 'Ana', siteId: 's1', resource: 'site_access', resourceId: 'r1' }]);
    expect(csv.startsWith('\uFEFF' + AUDIT_CSV_HEADER.join(','))).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(3);
    expect(csv).toContain('"org.site_access.grant"');
  });
});

describe('isAssignableSiteRole', () => {
  it('accepte vide, admin, member et les rôles dynamiques de l’organisation uniquement', () => {
    expect(isAssignableSiteRole(null, [])).toBe(true);
    expect(isAssignableSiteRole('admin', [])).toBe(true);
    expect(isAssignableSiteRole('member', [])).toBe(true);
    expect(isAssignableSiteRole('reviewer', ['reviewer'])).toBe(true);
    expect(isAssignableSiteRole('owner', ['reviewer'])).toBe(false);
    expect(isAssignableSiteRole('reviewer', [])).toBe(false);
  });
});

describe('libellés de modules', () => {
  it('couvre les modules ajoutés dans les 4 langues', () => {
    for (const id of ['events', 'formations', 'courses', 'shop']) {
      expect(isModuleId(id)).toBe(true);
      if (isModuleId(id)) for (const l of ['fr', 'en', 'es', 'ar'] as const) expect(getModuleLabel(id, l).length).toBeGreaterThan(0);
    }
    expect(isModuleId('constructor')).toBe(false);
  });
});
