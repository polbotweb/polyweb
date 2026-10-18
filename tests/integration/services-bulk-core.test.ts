/**
 * bulkServiceLifecycle sur le moteur générique core/bulk — base réelle.
 * Publication groupée + audit batchId commun ; transition interdite → BAD_REQUEST sans écriture ;
 * service d'un autre tenant → FORBIDDEN ; éditeur sans permission → FORBIDDEN.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: any) => def };
});

import { and, eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { auditLog, organization, services, user } from '@database/schemas';
import { bulkServiceLifecycle, serviceBulkOperations } from '@/actions/services/bulk';
import { bulkOperationUi } from '@/core/bulk';

const bulk = (bulkServiceLifecycle as any).handler as (i: any, c: any) => Promise<any>;
const db = getDrizzle();
const t = `sbulk-${Date.now().toString(36)}`;
const admin = `${t}-admin`;
const member = `${t}-member`;
const orgId = `${t}-org`;
const ids = [crypto.randomUUID(), crypto.randomUUID()];
const foreignId = crypto.randomUUID();
const ctx = (id = admin, role = 'admin') => ({ locals: { user: { id, role, email: `${id}@test.local`, banned: false }, session: { id: `${t}-s` } }, request: { headers: new Headers() }, clientAddress: '127.0.0.1' }) as any;
const statuses = async () => db.select({ id: services.id, status: services.status }).from(services).where(inArray(services.id, ids));

beforeAll(async () => {
  await db.insert(user).values([{ id: admin, name: 'Services bulk admin', email: `${admin}@test.local`, role: 'admin' }, { id: member, name: 'Services bulk member', email: `${member}@test.local`, role: 'user' }]);
  await db.insert(organization).values({ id: orgId, name: 'Bulk org', slug: orgId, createdAt: new Date() });
  await db.insert(services).values([
    ...ids.map((id, i) => ({ id, providerId: admin, slug: `${t}-${i}` })),
    { id: foreignId, providerId: admin, slug: `${t}-foreign`, organizationId: orgId },
  ]);
});

afterAll(async () => {
  await db.delete(services).where(inArray(services.id, [...ids, foreignId]));
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(inArray(user.id, [admin, member]));
});

describe('bulkServiceLifecycle (core/bulk)', () => {
  it('publie tout et audite avec un batchId commun', async () => {
    expect(await bulk({ ids, organizationId: null, operation: 'publish' }, ctx())).toMatchObject({ updated: 2 });
    expect((await statuses()).every((r) => r.status === 'PUBLISHED')).toBe(true);
    let audits: Array<{ metadata: unknown }> = [];
    for (let i = 0; i < 50 && audits.length < 2; i++) {
      audits = await db.select({ metadata: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.action, 'SERVICE_PUBLISH'), inArray(auditLog.resourceId, ids)));
      if (audits.length < 2) await new Promise((r) => setTimeout(r, 50));
    }
    expect(audits.length).toBe(2);
    expect(new Set(audits.map((a) => (a.metadata as any).batchId)).size).toBe(1);
  });

  it('transition interdite sur une ligne → BAD_REQUEST, aucune écriture', async () => {
    await db.update(services).set({ status: 'DELETED' }).where(eq(services.id, ids[1]!));
    await expect(bulk({ ids, organizationId: null, operation: 'archive' }, ctx())).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await statuses()).find((r) => r.id === ids[0])!.status).toBe('PUBLISHED');
  });

  it('service hors tenant → FORBIDDEN', async () => {
    await expect(bulk({ ids: [ids[0], foreignId], organizationId: null, operation: 'unpublish' }, ctx())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('utilisateur sans permission → FORBIDDEN', async () => {
    await expect(bulk({ ids: [ids[0]], organizationId: null, operation: 'delete' }, ctx(member, 'user'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('UI : suppression et archivage exigent une confirmation, pas la publication', () => {
    expect(bulkOperationUi(serviceBulkOperations, 'delete').requiresConfirmation).toBe(true);
    expect(bulkOperationUi(serviceBulkOperations, 'archive').requiresConfirmation).toBe(true);
    expect(bulkOperationUi(serviceBulkOperations, 'publish').requiresConfirmation).toBe(false);
  });
});
