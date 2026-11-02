import { describe, it, expect } from 'vitest';
import { effectiveSiteRole } from '@/core/permissions/tenant';

const rows = [{ siteId: 's1', role: null }, { siteId: 's2', role: 'crm-reader' }];

describe('effectiveSiteRole — accès par site', () => {
  it('sans ligne : rôle d’organisation inchangé (rétrocompatible)', () => {
    expect(effectiveSiteRole('admin', [], 's9')).toEqual({ role: 'admin' });
    expect(effectiveSiteRole('member', [], null)).toEqual({ role: 'member' });
  });
  it('le propriétaire n’est jamais restreint', () => {
    expect(effectiveSiteRole('owner', rows, 's9')).toEqual({ role: 'owner' });
  });
  it('membre restreint : site non listé ou site inconnu → refus (cross-site)', () => {
    expect(effectiveSiteRole('admin', rows, 's9')).toBeNull();
    expect(effectiveSiteRole('admin', rows, null)).toBeNull();
    expect(effectiveSiteRole('admin', rows, undefined)).toBeNull();
  });
  it('site listé : rôle de la ligne prioritaire, sinon rôle d’organisation', () => {
    expect(effectiveSiteRole('admin', rows, 's1')).toEqual({ role: 'admin' });
    expect(effectiveSiteRole('admin', rows, 's2')).toEqual({ role: 'crm-reader' });
  });
  it('non-membre : laissé à la décision tenant (refus not-member)', () => {
    expect(effectiveSiteRole(null, rows, 's1')).toEqual({ role: null });
  });
});
