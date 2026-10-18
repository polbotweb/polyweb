import { Effect } from "effect";
import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { serviceAvailability } from "@database/schemas";
import { resolveServiceTenant, serviceOrganizationIdSchema, requireServiceLockOwner } from "./_helpers";
import { serviceAvailabilitySchema } from "@/modules/services/validation";
import { auditService, invalidateServicesCache } from "./_helpers";
import { actionTry, effectHandler, fail } from "@/lib/effect/action";
import { requireServicePermission, serviceInTenant } from "@/modules/services/permissions";

/** Créneau sans chevauchement (Effect natif : lecture via actionTry, CONFLICT via fail). */
const noAvailabilityOverlap = (input: { serviceId: string; id?: string; dayOfWeek: number; startTime: string; endTime: string; timezone: string }) =>
  Effect.gen(function* () {
    const conditions = [eq(serviceAvailability.serviceId, input.serviceId), eq(serviceAvailability.dayOfWeek, input.dayOfWeek), eq(serviceAvailability.timezone, input.timezone), lt(serviceAvailability.startTime, input.endTime), gt(serviceAvailability.endTime, input.startTime)];
    if (input.id) conditions.push(ne(serviceAvailability.id, input.id));
    const [overlap] = yield* actionTry("services/availability.overlap", () => getDrizzle().select({ id: serviceAvailability.id }).from(serviceAvailability).where(and(...conditions)).limit(1));
    if (overlap) return yield* fail("CONFLICT", "Ce créneau chevauche une disponibilité existante.");
  });

export const createServiceAvailability = defineAction({ input: serviceAvailabilitySchema.extend({ organizationId: serviceOrganizationIdSchema }), handler: effectHandler((input, context) => Effect.gen(function* () {
  const tenant = resolveServiceTenant(input); const user = yield* requireServicePermission(context, tenant, { service: ["update"] }); yield* serviceInTenant(input.serviceId, tenant); yield* requireServiceLockOwner(input.serviceId, user.id, context.locals.session?.id); yield* noAvailabilityOverlap(input); return yield* actionTry("services/availability.createServiceAvailability", async () => {
  const [row] = await getDrizzle().insert(serviceAvailability).values({ serviceId: input.serviceId, dayOfWeek: input.dayOfWeek, startTime: input.startTime, endTime: input.endTime, timezone: input.timezone, maxParticipants: input.maxParticipants ?? null }).returning(); auditService(context, user.id, "SERVICE_UPDATE", { resource: "serviceAvailability", resourceId: row.id, metadata: { serviceId: input.serviceId, action: "CREATE" } }); invalidateServicesCache(); return row;
}); })) });

export const updateServiceAvailability = defineAction({ input: serviceAvailabilitySchema.extend({ id: z.uuid(), organizationId: serviceOrganizationIdSchema }), handler: effectHandler((input, context) => Effect.gen(function* () {
  const tenant = resolveServiceTenant(input); const user = yield* requireServicePermission(context, tenant, { service: ["update"] }); yield* serviceInTenant(input.serviceId, tenant); yield* requireServiceLockOwner(input.serviceId, user.id, context.locals.session?.id); yield* noAvailabilityOverlap(input); return yield* actionTry("services/availability.updateServiceAvailability", async () => {
  const [row] = await getDrizzle().update(serviceAvailability).set({ dayOfWeek: input.dayOfWeek, startTime: input.startTime, endTime: input.endTime, timezone: input.timezone, maxParticipants: input.maxParticipants ?? null }).where(and(eq(serviceAvailability.id, input.id), eq(serviceAvailability.serviceId, input.serviceId))).returning(); if (!row) throw new ActionError({ code: "NOT_FOUND", message: "Disponibilité introuvable." }); auditService(context, user.id, "SERVICE_UPDATE", { resource: "serviceAvailability", resourceId: row.id, metadata: { serviceId: input.serviceId, action: "UPDATE" } }); invalidateServicesCache(); return row;
}); })) });

export const deleteServiceAvailability = defineAction({ input: z.object({ id: z.uuid(), serviceId: z.uuid(), organizationId: serviceOrganizationIdSchema }), handler: effectHandler((input, context) => Effect.gen(function* () {
  const tenant = resolveServiceTenant(input); const user = yield* requireServicePermission(context, tenant, { service: ["update"] }); yield* serviceInTenant(input.serviceId, tenant); yield* requireServiceLockOwner(input.serviceId, user.id, context.locals.session?.id); return yield* actionTry("services/availability.deleteServiceAvailability", async () => { const result = await getDrizzle().delete(serviceAvailability).where(and(eq(serviceAvailability.id, input.id), eq(serviceAvailability.serviceId, input.serviceId))).returning({ id: serviceAvailability.id }); if (!result[0]) throw new ActionError({ code: "NOT_FOUND", message: "Disponibilité introuvable." }); auditService(context, user.id, "SERVICE_UPDATE", { resource: "serviceAvailability", resourceId: input.id, metadata: { serviceId: input.serviceId, action: "DELETE" } }); invalidateServicesCache(); return { success: true };
}); })) });