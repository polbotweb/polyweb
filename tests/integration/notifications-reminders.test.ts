/** Relances planifiées (N6-A) : source factures — e-mail client en file + in-app auteur, idempotent, niveau par niveau. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: unknown) => def };
});

import { Effect, Layer } from 'effect';
import { and, eq, inArray, like } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { emailOutbox, notifications, organization, sales, salesPayments, salesReminders, user } from '@database/schemas';
import { AppConfig, appConfigFrom } from '@/lib/effect/config';
import { salesService, type SalesDocumentInput } from '@/modules/sales/services/salesDocument.service';
import { remindInvoices, reminderDedupeKey, reminderLocale } from '@/modules/sales/notifications/invoice-reminders';
import { sites } from '@database/schemas/content.schema';
import { processEmailOutbox } from '@/core/notifications/email-outbox';
import { isTransactionalEmailTemplate, listNotificationCategories } from '@/core/notifications/registry';
import { setNotificationPreference } from '@/core/notifications/service';
import type { EmailPayload } from '@/smtp/types';
import { registerModuleNotifications } from '@/modules/notifications';
import { renderNotificationEmail } from '@/core/notifications/email-templates';

const db = getDrizzle();
const t = `rem-${Date.now().toString(36)}`;
const author = `${t}-author`;
const orgId = `${t}-org`;
const owner = { userId: author, sessionId: null };
const config = appConfigFrom({ NODE_ENV: 'test', SITE_URL: 'https://site.test', POLYWEB_SIGNING_SECRET: 'test-secret' });
const run = <A, E>(e: Effect.Effect<A, E, AppConfig>) => Effect.runPromise(e.pipe(Effect.provide(Layer.succeed(AppConfig, config))));
const ISSUE_DAY = '2026-03-02';

const draft = (customerEmail: string | null): SalesDocumentInput => ({
  kind: 'invoice', organizationId: orgId, title: `${t} invoice`, customerName: 'Client Test', customerEmail,
  customerCountry: 'FR', customerType: 'B2C', sellerCountry: 'FR', supplyType: 'services', currency: 'EUR', paymentTermDays: 30,
  lines: [{ description: 'Prestation', quantity: '1', unitPriceMinor: 10000, taxCategory: 'standard' }],
});
const issue = async (email: string | null = 'client@test.local') => {
  const doc = await run(salesService.create(draft(email), author, ISSUE_DAY));
  return run(salesService.transition(doc.id, 'ISSUED', owner, 'fr', ISSUE_DAY));
};
const outboxFor = (id: string) => db.select().from(emailOutbox).where(like(emailOutbox.dedupeKey, `sales.reminder:${id}:%`));
const notifsFor = (id: string) => db.select().from(notifications).where(and(eq(notifications.module, 'sales'), eq(notifications.resourceId, id)));

beforeAll(async () => {
  registerModuleNotifications();
  await db.insert(user).values({ id: author, name: 'Reminder author', email: `${author}@test.local`, role: 'admin' });
  await db.insert(organization).values({ id: orgId, name: 'Reminder org', slug: orgId, createdAt: new Date() });
});

afterAll(async () => {
  await db.delete(sites).where(like(sites.slug, `${t}%`));
  const ids = (await db.select({ id: sales.id }).from(sales).where(eq(sales.organizationId, orgId))).map((d) => d.id);
  if (ids.length) {
    await db.delete(emailOutbox).where(inArray(emailOutbox.dedupeKey, ids.flatMap((id) => [1, 2, 3].map((l) => reminderDedupeKey(id, l)))));
    await db.delete(notifications).where(inArray(notifications.resourceId, ids));
    await db.delete(salesReminders).where(inArray(salesReminders.documentId, ids));
    await db.delete(salesPayments).where(inArray(salesPayments.documentId, ids));
    await db.delete(sales).where(eq(sales.organizationId, orgId));
  }
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(eq(user.id, author));
});

describe('invoice reminders', () => {
  it('queues the customer email and notifies the author once per level', async () => {
    const invoice = await issue();
    expect(await run(remindInvoices({ now: new Date('2026-04-01T08:00:00Z'), ids: [invoice.id] }))).toBe(0);
    expect(await run(remindInvoices({ now: new Date('2026-04-09T08:00:00Z'), ids: [invoice.id] }))).toBe(1);
    expect(await run(remindInvoices({ now: new Date('2026-04-09T09:00:00Z'), ids: [invoice.id] }))).toBe(0);
    const [email] = await outboxFor(invoice.id);
    expect(email).toMatchObject({ status: 'pending', template: 'sales.invoice-reminder', category: 'billing', userId: null, toEmail: 'client@test.local' });
    expect(email!.data).toMatchObject({ number: invoice.number, level: 1, daysOverdue: 8, amountDueMinor: invoice.grossMinor, currency: 'EUR' });
    const notes = await notifsFor(invoice.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ userId: author, type: 'INVOICE_REMINDER_SENT', category: 'billing', organizationId: orgId });

    expect(await run(remindInvoices({ now: new Date('2026-05-05T08:00:00Z'), ids: [invoice.id] }))).toBe(1);
    expect(await outboxFor(invoice.id)).toHaveLength(2);
    expect(await notifsFor(invoice.id)).toHaveLength(2);

    const rendered = await run(renderNotificationEmail('sales.invoice-reminder', email!.data as Record<string, unknown>, { locale: 'fr', siteUrl: 'https://site.test' }));
    expect(rendered.subject).toContain(invoice.number!);
    expect(rendered.text).toContain('https://site.test/');
  });

  it('skips the email without a customer address but still notifies, and ignores paid invoices', async () => {
    const noEmail = await issue(null);
    const paid = await issue();
    await run(salesService.recordPayment(paid.id, { amountMinor: paid.grossMinor, method: 'card', paidAt: ISSUE_DAY }, author));
    expect(await run(remindInvoices({ now: new Date('2026-04-09T08:00:00Z'), ids: [noEmail.id, paid.id] }))).toBe(1);
    expect(await outboxFor(noEmail.id)).toHaveLength(0);
    expect(await notifsFor(noEmail.id)).toHaveLength(1);
    expect(await outboxFor(paid.id)).toHaveLength(0);
  });

  it('sends the customer reminder as transactional: author preferences ignored, no unsubscribe headers', async () => {
    expect(isTransactionalEmailTemplate('sales.invoice-reminder')).toBe(true);
    expect(listNotificationCategories().find((c) => c.category === 'billing')?.channels).toEqual(['in_app']);
    await run(setNotificationPreference(author, 'billing', 'email', false));
    const invoice = await issue();
    expect(await run(remindInvoices({ now: new Date('2026-04-09T08:00:00Z'), ids: [invoice.id] }))).toBe(1);
    const [email] = await outboxFor(invoice.id);
    const sent: EmailPayload[] = [];
    const tally = await run(processEmailOutbox({ ids: [email!.id], now: new Date(Date.now() + 60_000), send: (p) => Effect.sync(() => void sent.push(p)) }));
    expect(tally).toMatchObject({ sent: 1 });
    expect(sent[0]!.headers).toBeUndefined();
    expect(sent[0]!.text).not.toContain('/notifications/unsubscribe');
  });

  it('localizes the reminder from the organization site defaultLocale, with a validated fallback', async () => {
    expect(await run(reminderLocale(null))).toBe('fr');
    expect(await run(reminderLocale(orgId))).toBe('fr');
    await db.insert(sites).values({ slug: `${t}-bad`, name: 'Bad', defaultLocale: 'xx', organizationId: orgId, createdAt: new Date('2026-01-01T00:00:00Z') });
    expect(await run(reminderLocale(orgId))).toBe('fr');
    await db.delete(sites).where(eq(sites.slug, `${t}-bad`));
    await db.insert(sites).values({ slug: `${t}-es`, name: 'ES', defaultLocale: 'es', organizationId: orgId, createdAt: new Date('2026-01-01T00:00:00Z') });
    await db.insert(sites).values({ slug: `${t}-ar`, name: 'AR', defaultLocale: 'ar', organizationId: orgId, createdAt: new Date('2026-02-01T00:00:00Z') });
    expect(await run(reminderLocale(orgId))).toBe('es');
    const invoice = await issue();
    expect(await run(remindInvoices({ now: new Date('2026-04-09T08:00:00Z'), ids: [invoice.id] }))).toBe(1);
    const [email] = await outboxFor(invoice.id);
    expect(email!.locale).toBe('es');
    const payPath = (email!.data as { payPath: string | null }).payPath;
    expect(payPath === null || payPath.startsWith('/es/')).toBe(true);
  });
});
