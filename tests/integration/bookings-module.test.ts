/** module bookings — ressources (plages, fuseau), réservations sans chevauchement sous verrou, numéro à la confirmation, isolation tenant (base réelle). */
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
import { organization, user } from '@database/schemas';
import { bookingsService } from '@/modules/bookings/services/bookings.service';
import { bookingsLoader } from '@/modules/bookings/loaders';

const db = getDrizzle();
const t = `book-${Date.now().toString(36)}`;
const author = `${t}-author`;
const orgId = `${t}-org`;
const otherOrg = `${t}-other`;
const owner = { userId: author, sessionId: null };
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const failure = async <A, E>(effect: Effect.Effect<A, E>) => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) throw new Error('succès inattendu');
  const reason = exit.cause.reasons.find((r) => r._tag === 'Fail');
  return (reason as { error: { code?: string; message?: string; _tag: string } } | undefined)?.error;
};
// 2027-01-11 est un lundi ; Europe/Paris = UTC+1 en hiver.
const monday = '2027-01-11';
const windows = [{ weekday: 1, start: '09:00', end: '12:00' }, { weekday: 1, start: '14:00', end: '18:00' }];

beforeAll(async () => {
  await db.insert(user).values({ id: author, name: 'Bookings author', email: `${author}@test.local`, role: 'admin' });
  await db.insert(organization).values([
    { id: orgId, name: 'Bookings org', slug: orgId, createdAt: new Date() },
    { id: otherOrg, name: 'Bookings other', slug: otherOrg, createdAt: new Date() },
  ]);
});

afterAll(async () => {
  await db.delete(organization).where(inArray(organization.id, [orgId, otherOrg]));
  await db.delete(user).where(eq(user.id, author));
});

describe('module bookings', () => {
  let room = '';
  let first = '';

  it('crée des ressources normalisées, code unique par tenant', async () => {
    const r = await run(bookingsService.createResource({ organizationId: orgId, code: ' salle-a ', name: 'Salle A', kind: 'room', capacity: 6, timezone: 'Europe/Paris', slotMinutes: 60, windows }));
    expect(r).toMatchObject({ code: 'SALLE-A', capacity: 6, timezone: 'Europe/Paris', active: true });
    room = r.id;
    expect((await failure(bookingsService.createResource({ organizationId: orgId, code: 'SALLE-A', name: 'Doublon' })))?.code).toBe('CONFLICT');
    await run(bookingsService.createResource({ organizationId: otherOrg, code: 'SALLE-A', name: 'Autre tenant' }));
    expect((await failure(bookingsService.createResource({ organizationId: orgId, code: 'X', name: 'Fuseau', timezone: 'Nowhere/City' })))?.code).toBe('BAD_REQUEST');
  });

  it('réserve en heure locale et refuse hors plage, chevauchement, capacité, autre tenant', async () => {
    const b = await run(bookingsService.createBooking({ organizationId: orgId, resourceId: room, slot: { date: monday, time: '09:00', durationMinutes: 60 }, customerName: 'Ada', customerEmail: 'ADA@x.test', partySize: 2 }, author));
    expect(b.startsAt.toISOString()).toBe('2027-01-11T08:00:00.000Z');
    expect(b).toMatchObject({ status: 'REQUESTED', number: null, customerEmail: 'ada@x.test' });
    first = b.id;
    const slot = (time: string, durationMinutes = 60) => ({ date: monday, time, durationMinutes });
    expect((await failure(bookingsService.createBooking({ organizationId: orgId, resourceId: room, slot: slot('09:30'), customerName: 'Bob' }, author)))?.code).toBe('CONFLICT');
    expect((await failure(bookingsService.createBooking({ organizationId: orgId, resourceId: room, slot: slot('11:30'), customerName: 'Bob' }, author)))?.code).toBe('BAD_REQUEST');
    expect((await failure(bookingsService.createBooking({ organizationId: orgId, resourceId: room, slot: slot('10:00'), customerName: 'Bob', partySize: 7 }, author)))?.code).toBe('BAD_REQUEST');
    expect((await failure(bookingsService.createBooking({ organizationId: otherOrg, resourceId: room, slot: slot('10:00'), customerName: 'Bob' }, author)))?.code).toBe('NOT_FOUND');
    // Contigu : [10:00, 11:00) après [09:00, 10:00) est accepté.
    await run(bookingsService.createBooking({ organizationId: orgId, resourceId: room, slot: slot('10:00'), customerName: 'Bob' }, author));
  });

  it('sérialise deux réservations concurrentes sur le même créneau', async () => {
    const attempt = (name: string) => Effect.runPromiseExit(bookingsService.createBooking({ organizationId: orgId, resourceId: room, slot: { date: monday, time: '14:00', durationMinutes: 90 }, customerName: name }, author));
    const results = await Promise.all([attempt('C1'), attempt('C2'), attempt('C3')]);
    expect(results.filter(Exit.isSuccess)).toHaveLength(1);
  });

  it('liste les créneaux libres du jour', async () => {
    const day = await run(bookingsLoader.availability(room, orgId, monday));
    expect(await run(bookingsLoader.availability(room, otherOrg, monday))).toBeNull();
    const slots = day!.slots;
    // Locale : 09-10 et 10-11 pris, 14:00-15:30 pris → 11:00 et 17:00 libres, rien hors plage.
    const starts = slots.map((s) => s.start.toISOString().slice(11, 16));
    expect(starts).toContain('10:00'); // 11:00 locale
    expect(starts).not.toContain('08:00');
    expect(starts).not.toContain('13:00');
    expect(starts).toContain('16:00'); // 17:00 locale
  });

  it('confirme (numéro RES), refuse les transitions invalides, libère le créneau à l\'annulation', async () => {
    const confirmed = await run(bookingsService.transition(first, 'CONFIRMED', owner, { today: '2027-01-02' }));
    expect(confirmed.number).toMatch(/^RES-2027-\d{5}$/);
    expect((await failure(bookingsService.transition(first, 'COMPLETED', owner)))?.code).toBe('BAD_REQUEST');
    const back = await run(bookingsService.transition(first, 'REQUESTED', owner));
    const again = await run(bookingsService.transition(back.id, 'CONFIRMED', owner));
    expect(again.number).toBe(confirmed.number);
    await run(bookingsService.transition(first, 'CANCELLED', owner));
    const replacement = await run(bookingsService.createBooking({ organizationId: orgId, resourceId: room, slot: { date: monday, time: '09:00', durationMinutes: 60 }, customerName: 'Eve' }, author));
    expect(replacement.status).toBe('REQUESTED');
  });

  it('modifie le créneau (hors soi-même) et protège la ressource', async () => {
    const [b] = await run(bookingsService.findByIds([first]));
    expect(b!.status).toBe('CANCELLED');
    expect((await failure(bookingsService.updateBooking(first, { resourceId: room, slot: { date: monday, time: '16:00', durationMinutes: 60 }, customerName: 'Ada' }, owner)))?.code).toBe('BAD_REQUEST');
    const fresh = await run(bookingsService.createBooking({ organizationId: orgId, resourceId: room, slot: { date: monday, time: '16:00', durationMinutes: 60 }, customerName: 'Zoé', partySize: 5 }, author));
    const moved = await run(bookingsService.updateBooking(fresh.id, { resourceId: room, slot: { date: monday, time: '16:30', durationMinutes: 60 }, customerName: 'Zoé', partySize: 5 }, owner));
    expect(moved.startsAt.toISOString()).toBe('2027-01-11T15:30:00.000Z');
    expect((await failure(bookingsService.updateResource(room, { code: 'SALLE-A', name: 'Salle A', capacity: 4, timezone: 'Europe/Paris', slotMinutes: 60, windows })))?.code).toBe('CONFLICT');
    expect((await failure(bookingsService.deleteResource(room)))?.code).toBe('CONFLICT');
    await run(bookingsService.transition(fresh.id, 'CONFIRMED', owner));
    expect((await failure(bookingsService.deleteBooking(fresh.id, owner)))?.code).toBe('BAD_REQUEST');
    await run(bookingsService.deleteBooking(first, owner));
    expect(await run(bookingsService.findByIds([first]))).toHaveLength(0);
  });
});
