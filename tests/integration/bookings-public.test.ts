/** Parcours public bookings — créneaux libres, revérification transactionnelle, anti-robots, débit, lien signé, annulation, isolation tenant (base réelle). */
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
import { organization } from '@database/schemas';
import { appRuntime } from '@/lib/effect/runtime';
import { Mailer, makeMemoryMailer, type MailerShape } from '@/smtp/mailer';
import { formTimestampToken } from '@/modules/forms/domain/forms';
import { bookings, bookingsResources } from '@/modules/bookings/schema';
import { bookingsService } from '@/modules/bookings/services/bookings.service';
import {
  cancelGuestBooking, guestBooking, publicDay, publicResource, publicResources, resolveTenant, submitGuestBooking,
  PLATFORM_TENANT, type PublicTenant,
} from '@/modules/bookings/public/flow';

const db = getDrizzle();
const t = `bkpub-${Date.now().toString(36)}`;
const orgId = `${t}-org`;
const otherOrg = `${t}-other`;
const CODE = `PUB${Date.now().toString(36).toUpperCase()}`;
const mailer = makeMemoryMailer();
const provide = <A, E>(e: Effect.Effect<A, E, any>, m: MailerShape = mailer) => Effect.provideService(e, Mailer, m) as Effect.Effect<A, E, never>;
const run = <A, E>(e: Effect.Effect<A, E, any>, m?: MailerShape) => appRuntime.runPromise(provide(e, m));
const runExit = <A, E>(e: Effect.Effect<A, E, any>, m?: MailerShape) => appRuntime.runPromiseExit(provide(e, m));
const failure = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? (exit.cause.reasons.find((r) => r._tag === 'Fail') as { error: { _tag?: string; code?: string; fields?: string[] } } | undefined)?.error : undefined;

// 2027-01-11 est un lundi ; Europe/Paris = UTC+1 en hiver → créneaux 08:00Z, 09:00Z, 10:00Z.
const monday = '2027-01-11';
const now = new Date('2027-01-04T12:00:00Z');
const windows = [{ weekday: 1, start: '09:00', end: '12:00' }];
const slot = (h: string) => `${monday}T${h}:00:00.000Z`;
let ts = '';
let tenant: PublicTenant;
let other: PublicTenant;
let platformResourceId = '';
const meta = (ip: string) => ({ ip, userAgent: 'vitest', locale: 'fr' as const, now });
const guest = (startsAt: string, extra: Record<string, string> = {}) => ({
  startsAt, customerName: 'Ada Lovelace', customerEmail: 'Ada@Example.test', customerPhone: '+33 1 23 45 67 89', partySize: '2', notes: 'Fenêtre', _hp: '', _ts: ts, ...extra,
});
const resourceOf = async (tn: PublicTenant, code = CODE) => {
  const r = await run(publicResource(tn, code));
  if (!r) throw new Error('ressource introuvable');
  return r;
};

beforeAll(async () => {
  await db.insert(organization).values([
    { id: orgId, name: 'Public org', slug: orgId, createdAt: new Date() },
    { id: otherOrg, name: 'Other org', slug: otherOrg, createdAt: new Date() },
  ]);
  await run(bookingsService.createResource({ organizationId: orgId, code: CODE, name: 'Salle publique', capacity: 4, timezone: 'Europe/Paris', slotMinutes: 60, windows }));
  await run(bookingsService.createResource({ organizationId: orgId, code: `${CODE}-OFF`, name: 'Inactive', windows }));
  await db.update(bookingsResources).set({ active: false }).where(eq(bookingsResources.code, `${CODE}-OFF`));
  await run(bookingsService.createResource({ organizationId: otherOrg, code: CODE, name: 'Autre tenant', capacity: 4, timezone: 'Europe/Paris', slotMinutes: 60, windows }));
  platformResourceId = (await run(bookingsService.createResource({ organizationId: null, code: CODE, name: 'Plateforme', capacity: 2, timezone: 'UTC', slotMinutes: 30, windows }))).id;
  tenant = (await run(resolveTenant(orgId)))!;
  other = (await run(resolveTenant(otherOrg)))!;
  ts = await run(formTimestampToken);
  // Jeton anti-robot : au moins 2 s entre l'affichage et l'envoi.
  await new Promise((r) => setTimeout(r, 2_100));
});

afterAll(async () => {
  await db.delete(bookings).where(eq(bookings.resourceId, platformResourceId));
  await db.delete(bookingsResources).where(eq(bookingsResources.id, platformResourceId));
  await db.delete(organization).where(inArray(organization.id, [orgId, otherOrg]));
});

describe('parcours public bookings', () => {
  let bookingId = '';
  let token = '';

  it('résout le tenant et ne liste que les ressources actives du tenant', async () => {
    expect(tenant).toMatchObject({ organizationId: orgId, slug: orgId });
    expect(await run(resolveTenant(`${t}-nope`))).toBeNull();
    const codes = (await run(publicResources(tenant))).map((r) => r.code);
    expect(codes).toContain(CODE);
    expect(codes).not.toContain(`${CODE}-OFF`);
    expect(await run(publicResource(tenant, `${CODE}-OFF`))).toBeNull();
    expect(await run(publicResource(tenant, CODE.toLowerCase()))).not.toBeNull();
  });

  it('propose les créneaux des plages d’ouverture, borne l’horizon', async () => {
    const r = await resourceOf(tenant);
    const day = await run(publicDay(tenant, r, monday, now));
    expect(day.valid).toBe(true);
    expect(day.slots.map((s) => s.start.toISOString())).toEqual([slot('08'), slot('09'), slot('10')]);
    expect((await run(publicDay(tenant, r, '2027-01-03', now))).valid).toBe(false);
    expect((await run(publicDay(tenant, r, '2028-01-10', now))).valid).toBe(false);
    expect((await run(publicDay(tenant, r, 'nope', now))).valid).toBe(false);
  });

  it('crée la réservation visiteur, envoie l’e-mail avec le lien signé', async () => {
    const r = await resourceOf(tenant);
    const out = await run(submitGuestBooking(tenant, r, guest(slot('08')), meta('10.0.0.1')));
    expect(out.kind).toBe('created');
    if (out.kind !== 'created') return;
    expect(out.emailSent).toBe(true);
    bookingId = out.id;
    token = out.token;
    const mail = mailer.sent.at(-1)!;
    expect(mail.to).toBe('ada@example.test');
    expect(mail.html).toContain(`/fr/${orgId}/bookings/manage/${bookingId}?t=${token}`);
    const b = await run(guestBooking(tenant, bookingId, token));
    expect(b).toMatchObject({ status: 'REQUESTED', customerPhone: '+33 1 23 45 67 89', partySize: 2, organizationId: orgId });
    const day = await run(publicDay(tenant, r, monday, now));
    expect(day.slots.map((s) => s.start.toISOString())).toEqual([slot('09'), slot('10')]);
  });

  it('revérifie en transaction : créneau pris, non proposé, hors plage', async () => {
    const r = await resourceOf(tenant);
    expect(failure(await runExit(submitGuestBooking(tenant, r, guest(slot('08')), meta('10.0.0.2'))))?._tag).toBe('SlotUnavailableError');
    expect(failure(await runExit(submitGuestBooking(tenant, r, guest(`${monday}T09:30:00.000Z`), meta('10.0.0.2'))))?._tag).toBe('SlotUnavailableError');
    expect(failure(await runExit(submitGuestBooking(tenant, r, guest(slot('14')), meta('10.0.0.2'))))?._tag).toBe('SlotUnavailableError');
    expect(failure(await runExit(submitGuestBooking(tenant, r, guest('2026-01-01T08:00:00.000Z'), meta('10.0.0.2'))))?._tag).toBe('SlotUnavailableError');
  });

  it('sérialise les envois concurrents sur le même créneau', async () => {
    const r = await resourceOf(tenant);
    const results = await Promise.all(['10.0.1.1', '10.0.1.2', '10.0.1.3'].map((ip) => runExit(submitGuestBooking(tenant, r, guest(slot('09')), meta(ip)))));
    expect(results.filter(Exit.isSuccess)).toHaveLength(1);
    for (const e of results.filter(Exit.isFailure)) expect(failure(e)?._tag).toBe('SlotUnavailableError');
  });

  it('collecte toutes les erreurs de saisie (créneau compris)', async () => {
    const r = await resourceOf(tenant);
    const err = failure(await runExit(submitGuestBooking(tenant, r, guest('', { customerName: ' ', customerEmail: 'nope', customerPhone: 'abc', partySize: '9' }), meta('10.0.0.3'))));
    expect(err?._tag).toBe('InvalidGuestError');
    expect(new Set(err?.fields)).toEqual(new Set(['customerName', 'customerEmail', 'customerPhone', 'partySize', 'slot']));
  });

  it('robots : pot de miel ou jeton absent/trop récent → ignoré, rien n’est écrit', async () => {
    const r = await resourceOf(tenant);
    const before = (await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.resourceId, r.id))).length;
    expect(await run(submitGuestBooking(tenant, r, guest(slot('10'), { _hp: 'http://spam' }), meta('10.0.0.4')))).toEqual({ kind: 'discarded' });
    expect(await run(submitGuestBooking(tenant, r, guest(slot('10'), { _ts: '' }), meta('10.0.0.4')))).toEqual({ kind: 'discarded' });
    const fresh = await run(formTimestampToken);
    expect(await run(submitGuestBooking(tenant, r, guest(slot('10'), { _ts: fresh }), meta('10.0.0.4')))).toEqual({ kind: 'discarded' });
    expect((await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.resourceId, r.id))).length).toBe(before);
  });

  it('limite le débit par adresse IP et par tenant', async () => {
    const r = await resourceOf(tenant);
    const ip = '10.9.9.9';
    for (let i = 0; i < 10; i++) await run(submitGuestBooking(tenant, r, guest(slot('10'), { _hp: 'x' }), meta(ip)));
    const err = failure(await runExit(submitGuestBooking(tenant, r, guest(slot('10'), { _hp: 'x' }), meta(ip))));
    expect(err?._tag).toBe('RateLimitedError');
    // Compteur distinct pour un autre tenant.
    const p = await resourceOf(PLATFORM_TENANT);
    expect(await run(submitGuestBooking(PLATFORM_TENANT, p, guest(slot('08'), { _hp: 'x' }), meta(ip)))).toEqual({ kind: 'discarded' });
  });

  it('réservation conservée si l’e-mail échoue', async () => {
    const r = await resourceOf(tenant);
    const broken: MailerShape = { send: () => Effect.fail({ _tag: 'MailError', message: 'smtp down' } as never) };
    const out = await run(submitGuestBooking(tenant, r, guest(slot('10'), { customerEmail: 'bob@example.test' }), meta('10.0.0.5')), broken);
    expect(out).toMatchObject({ kind: 'created', emailSent: false });
  });

  it('lien signé : jeton faux, autre réservation ou autre tenant → null', async () => {
    expect(await run(guestBooking(tenant, bookingId, 'x'.repeat(32)))).toBeNull();
    expect(await run(guestBooking(tenant, bookingId, null))).toBeNull();
    expect(await run(guestBooking(other, bookingId, token))).toBeNull();
    expect(await run(guestBooking(PLATFORM_TENANT, bookingId, token))).toBeNull();
    expect(await run(cancelGuestBooking(other, bookingId, token, meta('10.0.0.6')))).toBeNull();
  });

  it('annule par lien signé, de façon idempotente, et libère le créneau', async () => {
    const m = meta('10.0.0.6');
    const row = await run(cancelGuestBooking(tenant, bookingId, token, m));
    expect(row?.status).toBe('CANCELLED');
    expect((await run(cancelGuestBooking(tenant, bookingId, token, m)))?.status).toBe('CANCELLED');
    const r = await resourceOf(tenant);
    expect((await run(publicDay(tenant, r, monday, now))).slots.map((s) => s.start.toISOString())).toContain(slot('08'));
  });

  it('refuse l’annulation d’une réservation commencée', async () => {
    const p = await resourceOf(PLATFORM_TENANT);
    const out = await run(submitGuestBooking(PLATFORM_TENANT, p, guest(`${monday}T09:00:00.000Z`, { partySize: '1' }), meta('10.0.0.7')));
    if (out.kind !== 'created') throw new Error('attendu : created');
    const later = { ...meta('10.0.0.7'), now: new Date(`${monday}T09:10:00Z`) };
    expect(failure(await runExit(cancelGuestBooking(PLATFORM_TENANT, out.id, out.token, later)))?.code).toBe('BAD_REQUEST');
  });
});
