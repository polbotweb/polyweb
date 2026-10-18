/**
 * Libération administrative de verrou : décision tenant pure (core/permissions/tenant)
 * et action `forceReleaseLock` (refus typé → FORBIDDEN, audit LOCK_FORCE_RELEASE).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';

vi.mock('astro:actions', () => ({
  ActionError: class extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) {
      super(message);
      this.code = code;
    }
  },
  defineAction: (definition: unknown) => definition,
}));

const { adminRelease, audit } = vi.hoisted(() => ({ adminRelease: vi.fn(), audit: vi.fn(async () => undefined) }));
vi.mock('@/core/locks/service', async (importOriginal) => ({ ...(await importOriginal<object>()), adminReleaseLock: adminRelease }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: audit, extractIp: () => '127.0.0.1' }));

import { isGlobalAdmin, isOrganizationAdminRole, tenantAdminDecision } from '@/core/permissions/tenant';
import { LockReleaseForbiddenError } from '@/core/locks/errors';
import { forceReleaseLock } from '@/actions/admin/locks';

const handler = (forceReleaseLock as unknown as { handler: (input: unknown, ctx: unknown) => Promise<unknown> }).handler;
const ctx = (user: unknown) => ({ locals: { user }, request: new Request('https://x.test', { headers: { 'accept-language': 'fr' } }), clientAddress: '127.0.0.1' });

describe('décision tenant (pure)', () => {
  const orgAdmin = { id: 'u1', role: 'user' };
  it('administrateur global : toute ressource, plateforme comprise', () => {
    expect(isGlobalAdmin({ id: 'g', role: 'user,admin' })).toBe(true);
    expect(tenantAdminDecision({ actor: { id: 'g', role: 'admin' }, organizationId: null, organizationRole: null })).toBe(true);
    expect(tenantAdminDecision({ actor: { id: 'g', role: 'admin' }, organizationId: 'org-b', organizationRole: null })).toBe(true);
  });
  it('owner/admin d’organisation : seulement sa propre organisation', () => {
    expect(isOrganizationAdminRole('owner')).toBe(true);
    expect(isOrganizationAdminRole('member,admin')).toBe(true);
    expect(tenantAdminDecision({ actor: orgAdmin, organizationId: 'org-a', organizationRole: 'admin' })).toBe(true);
    // Admin d'une autre organisation : pas membre de org-b → rôle null → refus.
    expect(tenantAdminDecision({ actor: orgAdmin, organizationId: 'org-b', organizationRole: null })).toBe(false);
    expect(tenantAdminDecision({ actor: orgAdmin, organizationId: 'org-a', organizationRole: 'member' })).toBe(false);
    expect(tenantAdminDecision({ actor: orgAdmin, organizationId: null, organizationRole: 'owner' })).toBe(false);
  });
  it('compte suspendu ou anonyme : refus', () => {
    expect(tenantAdminDecision({ actor: { id: 'g', role: 'admin', banned: true }, organizationId: null, organizationRole: null })).toBe(false);
    expect(tenantAdminDecision({ actor: null, organizationId: 'org-a', organizationRole: 'owner' })).toBe(false);
  });
});

describe('action forceReleaseLock', () => {
  beforeEach(() => { adminRelease.mockReset(); audit.mockClear(); });

  it('libère et audite LOCK_FORCE_RELEASE (ressource, organisation, ancien propriétaire)', async () => {
    const expiresAt = new Date('2026-10-18T14:00:00Z');
    adminRelease.mockReturnValue(Effect.succeed({ organizationId: 'org-a', previousOwner: { userId: 'editor', sessionId: 's1', expiresAt } }));
    await expect(handler({ resourceType: 'service', resourceId: 'svc-1' }, ctx({ id: 'adm', role: 'user' }))).resolves.toEqual({ released: true, previousOwnerId: 'editor' });
    expect(adminRelease).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'service', resourceId: 'svc-1', actor: expect.objectContaining({ id: 'adm' }), locale: 'fr' }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'adm', action: 'LOCK_FORCE_RELEASE', resource: 'service', resourceId: 'svc-1',
      metadata: { organizationId: 'org-a', previousOwner: { userId: 'editor', sessionId: 's1', expiresAt: expiresAt.toISOString() } },
    }));
  });

  it('refus tenant → FORBIDDEN, aucun audit', async () => {
    adminRelease.mockReturnValue(Effect.fail(new LockReleaseForbiddenError({ resourceType: 'service', resourceId: 'svc-1', locale: 'fr' })));
    await expect(handler({ resourceType: 'service', resourceId: 'svc-1' }, ctx({ id: 'other-org-admin', role: 'user' }))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(audit).not.toHaveBeenCalled();
  });

  it('anonyme → UNAUTHORIZED', async () => {
    await expect(handler({ resourceType: 'service', resourceId: 'svc-1' }, ctx(null))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(adminRelease).not.toHaveBeenCalled();
  });
});
