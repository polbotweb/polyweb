/** module crm — sociétés, contacts dédoublonnés, pipeline (transitions, perte, clôture), devis lié, activités, isolation tenant (base réelle). */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: unknown) => def };
});

import { Effect, Exit } from 'effect';
import { eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { organization, user, sales, crmOpportunityRevisions } from '@database/schemas';
import { crmService } from '@/modules/crm/services/crm.service';
import { salesService } from '@/modules/sales/services/salesDocument.service';

const db = getDrizzle();
const t = `crm-${Date.now().toString(36)}`;
const author = `${t}-author`;
const orgId = `${t}-org`;
const otherOrg = `${t}-other`;
const owner = { userId: author, sessionId: null };
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const failure = async <A, E>(effect: Effect.Effect<A, E>) => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) throw new Error('succès inattendu');
  const reason = exit.cause.reasons.find((r) => r._tag === 'Fail');
  return (reason as { error: { code?: string; _tag: string } } | undefined)?.error;
};

beforeAll(async () => {
  await db.insert(user).values({ id: author, name: 'CRM author', email: `${author}@test.local`, role: 'admin' });
  await db.insert(organization).values([
    { id: orgId, name: 'CRM org', slug: orgId, createdAt: new Date() },
    { id: otherOrg, name: 'CRM other', slug: otherOrg, createdAt: new Date() },
  ]);
});

afterAll(async () => {
  await db.delete(sales).where(inArray(sales.organizationId, [orgId, otherOrg]));
  await db.delete(organization).where(inArray(organization.id, [orgId, otherOrg]));
  await db.delete(user).where(eq(user.id, author));
});

describe('module crm', () => {
  it('crée une société normalisée et refuse un site invalide', async () => {
    const company = await run(crmService.createCompany({ organizationId: orgId, name: ' ACME ', email: 'Hello@Acme.FR', website: 'acme.fr', country: 'fr' }, author));
    expect(company).toMatchObject({ name: 'ACME', email: 'hello@acme.fr', website: 'https://acme.fr/', country: 'FR' });
    expect((await failure(crmService.createCompany({ organizationId: orgId, name: 'X', website: 'localhost' }, author)))?.code).toBe('BAD_REQUEST');
  });

  it('dédoublonne les contacts par tenant et refuse une société d’un autre tenant', async () => {
    const company = await run(crmService.createCompany({ organizationId: orgId, name: 'Dup SA' }, author));
    const foreign = await run(crmService.createCompany({ organizationId: otherOrg, name: 'Autre SA' }, author));
    const contact = await run(crmService.createContact({ organizationId: orgId, firstName: 'Zoé', lastName: 'Martin', email: 'Zoe@Dup.fr', companyId: company.id }, author));
    expect(contact.dedupKey).toBe('email:zoe@dup.fr');
    expect((await failure(crmService.createContact({ organizationId: orgId, lastName: 'Autre', email: 'zoe@dup.fr' }, author)))?.code).toBe('CONFLICT');
    // même e-mail dans un autre tenant : autorisé
    await run(crmService.createContact({ organizationId: otherOrg, lastName: 'Martin', email: 'zoe@dup.fr' }, author));
    expect((await failure(crmService.createContact({ organizationId: orgId, lastName: 'Fuite', companyId: foreign.id }, author)))?.code).toBe('NOT_FOUND');
    const updated = await run(crmService.updateContact(contact.id, { firstName: 'Zoé', lastName: 'Martin-Durand', email: 'zoe@dup.fr', companyId: company.id }));
    expect(updated.lastName).toBe('Martin-Durand');
  });

  it('fait avancer une opportunité dans le pipeline et la clôt', async () => {
    const opp = await run(crmService.createOpportunity({ organizationId: orgId, title: 'Refonte site été', amountMinor: 1_200_000, currency: 'EUR' }, author));
    expect(opp.status).toBe('NEW');
    expect(opp.ownerId).toBe(author);
    expect(opp.slug).toMatch(/^refonte-site-ete-/);
    expect((await failure(crmService.transition(opp.id, 'WON', owner)))?.code).toBe('BAD_REQUEST');
    await run(crmService.transition(opp.id, 'QUALIFIED', owner));
    await run(crmService.transition(opp.id, 'PROPOSAL', owner));
    const won = await run(crmService.transition(opp.id, 'WON', owner));
    expect(won.status).toBe('WON');
    expect(won.closedAt).toBeInstanceOf(Date);
    expect((await failure(crmService.updateOpportunity(opp.id, { title: 'x', amountMinor: 1, currency: 'EUR' }, owner)))?.code).toBe('BAD_REQUEST');
    const revisions = await db.select().from(crmOpportunityRevisions).where(eq(crmOpportunityRevisions.resourceId, opp.id));
    expect(revisions).toHaveLength(4);
  });

  it('exige une raison de perte et permet de rouvrir', async () => {
    const opp = await run(crmService.createOpportunity({ organizationId: orgId, title: 'Perdue', amountMinor: 5000, currency: 'EUR', probability: 40 }, author));
    expect((await failure(crmService.transition(opp.id, 'LOST', owner)))?.code).toBe('BAD_REQUEST');
    const lost = await run(crmService.transition(opp.id, 'LOST', owner, { lostReason: 'competitor' }));
    expect(lost).toMatchObject({ status: 'LOST', lostReason: 'competitor' });
    const reopened = await run(crmService.transition(opp.id, 'QUALIFIED', owner));
    expect(reopened).toMatchObject({ status: 'QUALIFIED', lostReason: null, closedAt: null });
    expect((await failure(crmService.createOpportunity({ organizationId: orgId, title: 'Neg', amountMinor: -1, currency: 'EUR' }, author)))?.code).toBe('BAD_REQUEST');
  });

  it('lie un devis du même tenant uniquement', async () => {
    const opp = await run(crmService.createOpportunity({ organizationId: orgId, title: 'Avec devis', amountMinor: 1000, currency: 'EUR' }, author));
    const base = { title: `${t} devis`, customerName: 'Client', customerCountry: 'FR', customerType: 'B2B', sellerCountry: 'FR', supplyType: 'services', currency: 'EUR', lines: [{ description: 'A', quantity: '1', unitPriceMinor: 1000, taxCategory: 'standard' }] } as const;
    const quote = await run(salesService.create({ ...base, kind: 'quote', organizationId: orgId }, author));
    const invoice = await run(salesService.create({ ...base, kind: 'invoice', organizationId: orgId }, author));
    const foreignQuote = await run(salesService.create({ ...base, kind: 'quote', organizationId: otherOrg }, author));
    expect((await run(crmService.linkQuote(opp.id, quote.id, owner))).quoteId).toBe(quote.id);
    expect((await failure(crmService.linkQuote(opp.id, invoice.id, owner)))?.code).toBe('BAD_REQUEST');
    expect((await failure(crmService.linkQuote(opp.id, foreignQuote.id, owner)))?.code).toBe('NOT_FOUND');
    expect((await run(crmService.linkQuote(opp.id, null, owner))).quoteId).toBeNull();
  });

  it('journalise des activités et refuse une cible d’un autre tenant', async () => {
    const opp = await run(crmService.createOpportunity({ organizationId: orgId, title: 'Suivi', amountMinor: 0, currency: 'EUR' }, author));
    const foreignOpp = await run(crmService.createOpportunity({ organizationId: otherOrg, title: 'Ailleurs', amountMinor: 0, currency: 'EUR' }, author));
    const task = await run(crmService.createActivity({ organizationId: orgId, kind: 'task', subject: 'Rappeler', dueAt: new Date('2026-11-02T09:00:00Z'), opportunityId: opp.id }, author));
    expect(task.doneAt).toBeNull();
    expect((await run(crmService.completeActivity(task.id, true))).doneAt).toBeInstanceOf(Date);
    expect((await failure(crmService.createActivity({ organizationId: orgId, kind: 'note', subject: 'x', opportunityId: foreignOpp.id }, author)))?.code).toBe('NOT_FOUND');
    expect((await failure(crmService.createActivity({ organizationId: orgId, kind: 'note', subject: 'Sans cible' }, author)))?.code).toBe('BAD_REQUEST');
    await run(crmService.deleteOpportunity(opp.id, owner));
    expect((await failure(crmService.completeActivity(task.id, false)))?.code).toBe('NOT_FOUND');
  });
});
