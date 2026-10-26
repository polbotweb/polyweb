/**
 * Actions Astro du domaine bookings : prologue Effect (garde de permission tenant, verrou,
 * validations zod) puis service. Ré-exportées depuis `src/actions/index.ts` (`actions.bookings.*`).
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { effectHandler } from "@/lib/effect/action";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { requireBookingsPermission, requireBookingsResourcePermission } from "../permissions";
import { bookingsService } from "../services/bookings.service";
import { BOOKING_STATUSES } from "../domain/workflow";
import { MAX_WINDOWS, RESOURCE_KINDS } from "../domain/resource";
import { bulkBookingsLifecycle } from "./bulk";
import { bookingsLoader } from "../loaders/bookings.loader";

const idInput = z.object({ id: z.uuid() });
const orgInput = { organizationId: z.string().nullable().default(null) };
const optionalText = (max: number) => z.string().max(max).nullable().default(null);
const ownerOf = (userId: string, context: { locals: { session?: { id: string } | null } }) => lockOwnerFrom(userId, context.locals.session?.id);
const hhmm = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/);

const resourceFields = {
  code: z.string().trim().min(1).max(16), name: z.string().trim().min(1).max(200),
  kind: z.enum(RESOURCE_KINDS).default("room"), capacity: z.number().int().min(1).max(10_000).default(1),
  timezone: z.string().trim().min(1).max(64).default("UTC"), slotMinutes: z.number().int().min(5).max(480).default(30),
  windows: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: hhmm, end: hhmm })).max(MAX_WINDOWS).default([]),
  active: z.boolean().default(true),
};
const slotInput = z.union([
  z.object({ startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }) }),
  z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), durationMinutes: z.number().int().min(5).max(7 * 24 * 60) }),
]);
const bookingFields = {
  resourceId: z.uuid(), slot: slotInput,
  customerName: z.string().trim().min(1).max(200), customerEmail: optionalText(254),
  partySize: z.number().int().min(1).max(10_000).default(1), notes: optionalText(5000),
};

export const bookingsActions = {
  bulk: bulkBookingsLifecycle,

  createResource: defineAction({
    input: z.object({ ...orgInput, ...resourceFields }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      yield* requireBookingsPermission(context, ["create"], input.organizationId);
      return yield* bookingsService.createResource(input);
    })),
  }),
  updateResource: defineAction({
    input: idInput.extend(resourceFields),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      yield* requireBookingsResourcePermission(context, ["update"], id, "resource");
      return yield* bookingsService.updateResource(id, input);
    })),
  }),
  deleteResource: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      yield* requireBookingsResourcePermission(context, ["delete"], id, "resource");
      return yield* bookingsService.deleteResource(id);
    })),
  }),
  availability: defineAction({
    input: z.object({ resourceId: z.uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      yield* requireBookingsResourcePermission(context, ["read"], input.resourceId, "resource");
      const organizationId = yield* bookingsLoader.resourceOrganization(input.resourceId);
      const day = yield* bookingsLoader.availability(input.resourceId, organizationId, input.date, { notBefore: new Date() });
      return (day?.slots ?? []).map((s) => ({ startsAt: s.start.toISOString(), endsAt: s.end.toISOString() }));
    })),
  }),

  create: defineAction({
    input: z.object({ ...orgInput, ...bookingFields }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBookingsPermission(context, ["create"], input.organizationId);
      return yield* bookingsService.createBooking(input, user.id);
    })),
  }),
  update: defineAction({
    input: idInput.extend(bookingFields),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      const user = yield* requireBookingsResourcePermission(context, ["update"], id);
      return yield* bookingsService.updateBooking(id, input, ownerOf(user.id, context), lockLocaleFrom(context.request.headers));
    })),
  }),
  transition: defineAction({
    input: idInput.extend({ to: z.enum(BOOKING_STATUSES) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBookingsResourcePermission(context, ["update"], input.id);
      return yield* bookingsService.transition(input.id, input.to, ownerOf(user.id, context), { locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  delete: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      const user = yield* requireBookingsResourcePermission(context, ["delete"], id);
      return yield* bookingsService.deleteBooking(id, ownerOf(user.id, context), lockLocaleFrom(context.request.headers));
    })),
  }),
  lock: defineAction({
    input: idInput.extend({ takeOver: z.boolean().optional() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBookingsResourcePermission(context, ["update"], input.id);
      return yield* bookingsService.lock(input.id, ownerOf(user.id, context), { takeOver: input.takeOver, locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  unlock: defineAction({
    input: idInput,
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBookingsResourcePermission(context, ["update"], input.id);
      yield* bookingsService.unlock(input.id, ownerOf(user.id, context));
      return { success: true };
    })),
  }),
};
