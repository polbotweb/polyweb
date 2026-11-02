import { describe, it, expect } from 'vitest';
import { tenantPermissionDecision, parsePermissionSet, coversPermissions } from '@/core/permissions/tenant';

const actor = { id: 'u1', role: 'user', banned: false };
const base = { actor, organizationId: 'org-a', organizationRole: 'member', dynamicRoles: {}, permissions: { crm: ['read'] } };

describe('tenantPermissionDecision — rôles fins d’organisation', () => {
  it('rétrocompatible : owner/admin d’org → tout dans leur org ; membre prédéfini seul → refus', () => {
    expect(tenantPermissionDecision({ ...base, organizationRole: 'owner' })).toEqual({ allowed: true, via: 'org-admin' });
    expect(tenantPermissionDecision({ ...base, organizationRole: 'admin', permissions: { sales: ['delete'] } })).toEqual({ allowed: true, via: 'org-admin' });
    expect(tenantPermissionDecision(base)).toEqual({ allowed: false, reason: 'insufficient-role' });
  });

  it('administrateur global → tout ; suspendu / anonyme / non-membre / plateforme → refus motivé', () => {
    expect(tenantPermissionDecision({ ...base, actor: { id: 'x', role: 'admin' }, organizationRole: null })).toEqual({ allowed: true, via: 'global-admin' });
    expect(tenantPermissionDecision({ ...base, actor: { id: 'x', role: 'admin', banned: true } })).toEqual({ allowed: false, reason: 'banned' });
    expect(tenantPermissionDecision({ ...base, actor: null })).toEqual({ allowed: false, reason: 'unauthenticated' });
    expect(tenantPermissionDecision({ ...base, organizationRole: null })).toEqual({ allowed: false, reason: 'not-member' });
    expect(tenantPermissionDecision({ ...base, organizationId: null })).toEqual({ allowed: false, reason: 'platform' });
  });

  it('rôle dynamique : accorde exactement ses permissions, jamais plus', () => {
    const dynamicRoles = { 'crm-reader': { crm: ['read'] }, 'sales-clerk': { sales: ['read', 'create'] } };
    const r = { ...base, organizationRole: 'crm-reader', dynamicRoles };
    expect(tenantPermissionDecision(r)).toEqual({ allowed: true, via: 'org-role' });
    expect(tenantPermissionDecision({ ...r, permissions: { crm: ['update'] } }).allowed).toBe(false);
    expect(tenantPermissionDecision({ ...r, permissions: { sales: ['read'] } }).allowed).toBe(false);
    // Plusieurs rôles : union.
    expect(tenantPermissionDecision({ ...r, organizationRole: 'crm-reader, sales-clerk', permissions: { crm: ['read'], sales: ['create'] } }).allowed).toBe(true);
    // Rôle inconnu (non défini dans l'org) : rien.
    expect(tenantPermissionDecision({ ...r, organizationRole: 'ghost' }).allowed).toBe(false);
  });

  it('« member » redéfini dynamiquement par l’organisation : seules les permissions dynamiques comptent', () => {
    expect(tenantPermissionDecision({ ...base, dynamicRoles: { member: { crm: ['read'] } } }).allowed).toBe(true);
    expect(tenantPermissionDecision({ ...base, dynamicRoles: { member: { crm: ['read'] } }, permissions: { crm: ['delete'] } }).allowed).toBe(false);
  });

  it('parsePermissionSet : JSON invalide ou mal typé → null (jamais d’élévation)', () => {
    expect(parsePermissionSet('{"crm":["read"]}')).toEqual({ crm: ['read'] });
    for (const bad of ['nope', '[]', 'null', '{"crm":"read"}', '{"crm":[1]}']) expect(parsePermissionSet(bad)).toBeNull();
    expect(coversPermissions({ crm: ['read'] }, {})).toBe(true);
  });
});
