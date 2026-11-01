/**
 * API publique du module Réservations : lecture `bookings:read`, création et
 * annulation (`POST /bookings/{id}/cancel`) `bookings:write`.
 * Les écritures sont attribuées au créateur de la clé (révision obligatoire) et
 * passent par le service (contrôle de créneau, verrous d'édition, workflow).
 */
import { desc, eq, gte, lt, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";
import { getDrizzle } from "@database/drizzle";
import type { ApiObjectSchema, ApiResourceDefinition, ApiTenant, ModuleApiDeclaration } from "@/core/api/contract";
import { iso, tableReader } from "@/core/api/table";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/effect/errors";
import { decode } from "@/lib/effect/schema";
import { BOOKING_STATUSES } from "../domain/workflow";
import { bookings } from "../schema";
import { bookingsService } from "../services/bookings.service";

type BookingRow = typeof bookings.$inferSelect;

export const serializeBooking = (r: BookingRow) => ({
  id: r.id,
  number: r.number,
  status: r.status,
  resourceId: r.resourceId,
  startsAt: r.startsAt.toISOString(),
  endsAt: r.endsAt.toISOString(),
  customerName: r.customerName,
  customerEmail: r.customerEmail,
  partySize: r.partySize,
  notes: r.notes,
  depositMinor: r.depositMinor,
  depositCurrency: r.depositCurrency,
  depositPaidAt: iso(r.depositPaidAt),
  confirmedAt: iso(r.confirmedAt),
  createdAt: r.createdAt.toISOString(),
  updatedAt: iso(r.updatedAt),
});

const instant = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const reader = tableReader<BookingRow, ReturnType<typeof serializeBooking>>(
  {
    name: "bookings",
    columns: { id: bookings.id, createdAt: bookings.createdAt, organizationId: bookings.organizationId },
    select: (where, limit) => getDrizzle().select().from(bookings).where(where).orderBy(desc(bookings.createdAt), desc(bookings.id)).limit(limit),
    filters: [
      { name: "status", description: "Statut.", values: BOOKING_STATUSES, where: (v) => eq(bookings.status, v as BookingRow["status"]) },
      { name: "resourceId", description: "Ressource réservée.", where: (v) => eq(bookings.resourceId, v) },
      { name: "from", description: "Début ≥ (ISO 8601).", where: (v) => { const d = instant(v); return d ? gte(bookings.startsAt, d) : sql`false`; } },
      { name: "to", description: "Début < (ISO 8601).", where: (v) => { const d = instant(v); return d ? lt(bookings.startsAt, d) : sql`false`; } },
    ],
  },
  serializeBooking,
);

const Text = (max: number) => Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(max))));
const BookingCreate = Schema.Struct({
  resourceId: Schema.String.check(Schema.isMaxLength(64)),
  startsAt: Schema.String.check(Schema.isMaxLength(40)),
  endsAt: Schema.String.check(Schema.isMaxLength(40)),
  customerName: Schema.String.check(Schema.isMaxLength(200)),
  customerEmail: Text(254),
  partySize: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 }))),
  notes: Text(5000),
});

const actor = (tenant: ApiTenant) =>
  tenant.actorUserId ? Effect.succeed(tenant.actorUserId) : Effect.fail(new ForbiddenError({ reason: "API key has no owner: writes on bookings require a key created by a user." }));

const bookingSchema: ApiObjectSchema = {
  properties: {
    id: { type: "string" },
    number: { type: "string", nullable: true },
    status: { type: "string", enum: BOOKING_STATUSES },
    resourceId: { type: "string" },
    startsAt: { type: "string", format: "date-time" },
    endsAt: { type: "string", format: "date-time" },
    customerName: { type: "string" },
    customerEmail: { type: "string", nullable: true },
    partySize: { type: "integer" },
    notes: { type: "string", nullable: true },
    depositMinor: { type: "integer", description: "Acompte en unités mineures." },
    depositCurrency: { type: "string" },
    depositPaidAt: { type: "string", format: "date-time", nullable: true },
    confirmedAt: { type: "string", format: "date-time", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time", nullable: true },
  },
  required: ["id", "status", "resourceId", "startsAt", "endsAt", "customerName", "createdAt"],
};

export const bookingsResource: ApiResourceDefinition<ReturnType<typeof serializeBooking>> = {
  name: "bookings",
  module: "bookings",
  description: "Réservations de l'organisation du site.",
  scope: "bookings:read",
  writeScope: "bookings:write",
  filters: reader.filters,
  schema: bookingSchema,
  inputSchema: {
    properties: {
      resourceId: { type: "string" },
      startsAt: { type: "string", format: "date-time" },
      endsAt: { type: "string", format: "date-time" },
      customerName: { type: "string" },
      customerEmail: { type: "string", nullable: true },
      partySize: { type: "integer" },
      notes: { type: "string", nullable: true },
    },
    required: ["resourceId", "startsAt", "endsAt", "customerName"],
  },
  list: reader.list,
  get: reader.get,
  create: (tenant, body) =>
    Effect.gen(function* () {
      const authorId = yield* actor(tenant);
      const input = yield* decode(BookingCreate)(body);
      if (!instant(input.startsAt) || !instant(input.endsAt)) return yield* Effect.fail(new ValidationError({ issues: [{ path: "startsAt", message: "Invalid ISO 8601 instant." }] }));
      const { startsAt, endsAt, ...rest } = input;
      const row = yield* bookingsService.createBooking({ ...rest, slot: { startsAt, endsAt }, organizationId: tenant.organizationId }, authorId);
      return serializeBooking(row);
    }),
  actions: [
    {
      name: "cancel",
      description: "Annule la réservation (idempotent si déjà annulée).",
      run: (tenant, id) =>
        Effect.gen(function* () {
          const authorId = yield* actor(tenant);
          const current = yield* reader.find(tenant, id);
          if (!current) return yield* Effect.fail(new NotFoundError({ entity: "Booking", id }));
          if (current.status === "CANCELLED") return serializeBooking(current);
          const row = yield* bookingsService.transition(id, "CANCELLED", { userId: authorId, sessionId: `api:${tenant.tokenId ?? "anonymous"}` });
          return serializeBooking(row);
        }),
    },
  ],
};

export const bookingsApi: ModuleApiDeclaration = {
  module: "bookings",
  resources: [bookingsResource as ApiResourceDefinition<unknown>],
  events: [
    { name: "booking.created", description: "Réservation créée (admin, parcours public ou API)." },
    { name: "booking.canceled", description: "Réservation annulée." },
  ],
};
