/**
 * Actions Astro du domaine logistics : prologue Effect (garde de permission tenant, verrou,
 * validations zod) puis service. Ré-exportées depuis `src/actions/index.ts` (`actions.logistics.*`).
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { effectHandler } from "@/lib/effect/action";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { requireLogisticsPermission, requireLogisticsResourcePermission } from "../permissions";
import { logisticsService } from "../services/logistics.service";
import { SHIPMENT_STATUSES } from "../domain/workflow";
import { MANUAL_MOVEMENT_KINDS } from "../domain/stock";
import { MAX_LINES } from "../domain/shipment";
import { bulkLogisticsLifecycle } from "./bulk";

const idInput = z.object({ id: z.uuid() });
const orgInput = { organizationId: z.string().nullable().default(null) };
const optionalText = (max: number) => z.string().max(max).nullable().default(null);
const sku = z.string().trim().min(1).max(64);
const ownerOf = (userId: string, context: { locals: { session?: { id: string } | null } }) => lockOwnerFrom(userId, context.locals.session?.id);

const warehouseFields = {
  code: z.string().trim().min(1).max(16), name: z.string().trim().min(1).max(200),
  country: optionalText(2), address: optionalText(1000), active: z.boolean().default(true),
};
const itemFields = { sku, name: z.string().trim().min(1).max(200), variantId: z.string().max(64).nullable().default(null) };
const shipmentFields = {
  title: optionalText(200),
  warehouseId: z.uuid(),
  salesDocumentId: z.uuid().nullable().default(null),
  recipientName: z.string().trim().min(1).max(200),
  address: optionalText(1000),
  country: z.string().trim().length(2),
  carrier: optionalText(100),
  trackingNumber: optionalText(64),
  weightGrams: z.number().int().min(0).max(10_000_000).nullable().default(null),
  notes: optionalText(5000),
  lines: z.array(z.object({ sku, description: optionalText(500), quantity: z.number().int().min(1).max(1_000_000) })).min(1).max(MAX_LINES),
};

export const logisticsActions = {
  bulk: bulkLogisticsLifecycle,

  createWarehouse: defineAction({
    input: z.object({ ...orgInput, ...warehouseFields }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      yield* requireLogisticsPermission(context, ["create"], input.organizationId);
      return yield* logisticsService.createWarehouse(input);
    })),
  }),
  updateWarehouse: defineAction({
    input: idInput.extend(warehouseFields),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      yield* requireLogisticsResourcePermission(context, ["update"], id, "warehouse");
      return yield* logisticsService.updateWarehouse(id, input);
    })),
  }),
  deleteWarehouse: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      yield* requireLogisticsResourcePermission(context, ["delete"], id, "warehouse");
      return yield* logisticsService.deleteWarehouse(id);
    })),
  }),

  createItem: defineAction({
    input: z.object({ ...orgInput, ...itemFields }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      yield* requireLogisticsPermission(context, ["create"], input.organizationId);
      return yield* logisticsService.createItem(input);
    })),
  }),
  updateItem: defineAction({
    input: idInput.extend(itemFields),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      yield* requireLogisticsResourcePermission(context, ["update"], id, "item");
      return yield* logisticsService.updateItem(id, input);
    })),
  }),
  deleteItem: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      yield* requireLogisticsResourcePermission(context, ["delete"], id, "item");
      return yield* logisticsService.deleteItem(id);
    })),
  }),

  recordMovement: defineAction({
    input: z.object({
      ...orgInput, warehouseId: z.uuid(), sku, kind: z.enum(MANUAL_MOVEMENT_KINDS),
      quantity: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0), reference: optionalText(200),
    }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireLogisticsPermission(context, ["update"], input.organizationId);
      return yield* logisticsService.recordMovement(input, user.id);
    })),
  }),
  transfer: defineAction({
    input: z.object({ ...orgInput, fromWarehouseId: z.uuid(), toWarehouseId: z.uuid(), sku, quantity: z.number().int().min(1).max(1_000_000), reference: optionalText(200) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireLogisticsPermission(context, ["update"], input.organizationId);
      return yield* logisticsService.transfer(input, user.id);
    })),
  }),

  create: defineAction({
    input: z.object({ ...orgInput, ...shipmentFields }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireLogisticsPermission(context, ["create"], input.organizationId);
      return yield* logisticsService.createShipment(input, user.id);
    })),
  }),
  update: defineAction({
    input: idInput.extend(shipmentFields),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      const user = yield* requireLogisticsResourcePermission(context, ["update"], id);
      return yield* logisticsService.updateShipment(id, input, ownerOf(user.id, context), lockLocaleFrom(context.request.headers));
    })),
  }),
  updateTracking: defineAction({
    input: idInput.extend({ carrier: optionalText(100), trackingNumber: optionalText(64) }),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      const user = yield* requireLogisticsResourcePermission(context, ["update"], id);
      return yield* logisticsService.updateTracking(id, input, ownerOf(user.id, context), lockLocaleFrom(context.request.headers));
    })),
  }),
  transition: defineAction({
    input: idInput.extend({ to: z.enum(SHIPMENT_STATUSES) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireLogisticsResourcePermission(context, ["update"], input.id);
      return yield* logisticsService.transition(input.id, input.to, ownerOf(user.id, context), { locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  delete: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      const user = yield* requireLogisticsResourcePermission(context, ["delete"], id);
      return yield* logisticsService.deleteShipment(id, ownerOf(user.id, context), lockLocaleFrom(context.request.headers));
    })),
  }),
  lock: defineAction({
    input: idInput.extend({ takeOver: z.boolean().optional() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireLogisticsResourcePermission(context, ["update"], input.id);
      return yield* logisticsService.lock(input.id, ownerOf(user.id, context), { takeOver: input.takeOver, locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  unlock: defineAction({
    input: idInput,
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireLogisticsResourcePermission(context, ["update"], input.id);
      yield* logisticsService.unlock(input.id, ownerOf(user.id, context));
      return { success: true };
    })),
  }),
};
