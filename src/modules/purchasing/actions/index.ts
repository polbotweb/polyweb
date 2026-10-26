/**
 * Actions Astro du domaine purchasing : prologue Effect (garde de permission tenant, verrou,
 * validations zod) puis service. Ré-exportées depuis `src/actions/index.ts` (`actions.purchasing.*`).
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { effectHandler } from "@/lib/effect/action";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { requirePurchasingPermission, requirePurchasingResourcePermission } from "../permissions";
import { purchasingService } from "../services/purchasing.service";
import { PURCHASE_ORDER_STATUSES } from "../domain/workflow";
import { MAX_LINES } from "../domain/order";
import { bulkPurchasingLifecycle } from "./bulk";

const idInput = z.object({ id: z.uuid() });
const orgInput = { organizationId: z.string().nullable().default(null) };
const optionalText = (max: number) => z.string().max(max).nullable().default(null);
const ownerOf = (userId: string, context: { locals: { session?: { id: string } | null } }) => lockOwnerFrom(userId, context.locals.session?.id);

const supplierFields = {
  code: z.string().trim().min(1).max(16), name: z.string().trim().min(1).max(200),
  email: optionalText(254), country: optionalText(2), vatNumber: optionalText(32), address: optionalText(1000),
  paymentTermDays: z.number().int().min(0).max(365).default(30), active: z.boolean().default(true),
};
const orderFields = {
  title: optionalText(200),
  supplierId: z.uuid(),
  warehouseId: z.uuid(),
  currency: z.string().trim().length(3),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  notes: optionalText(5000),
  lines: z.array(z.object({
    sku: z.string().trim().min(1).max(64), description: optionalText(500),
    quantity: z.number().int().min(1).max(1_000_000), unitPrice: z.string().trim().min(1).max(24),
  })).min(1).max(MAX_LINES),
};

export const purchasingActions = {
  bulk: bulkPurchasingLifecycle,

  createSupplier: defineAction({
    input: z.object({ ...orgInput, ...supplierFields }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      yield* requirePurchasingPermission(context, ["create"], input.organizationId);
      return yield* purchasingService.createSupplier(input);
    })),
  }),
  updateSupplier: defineAction({
    input: idInput.extend(supplierFields),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      yield* requirePurchasingResourcePermission(context, ["update"], id, "supplier");
      return yield* purchasingService.updateSupplier(id, input);
    })),
  }),
  deleteSupplier: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      yield* requirePurchasingResourcePermission(context, ["delete"], id, "supplier");
      return yield* purchasingService.deleteSupplier(id);
    })),
  }),

  create: defineAction({
    input: z.object({ ...orgInput, ...orderFields }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingPermission(context, ["create"], input.organizationId);
      return yield* purchasingService.createOrder(input, user.id);
    })),
  }),
  update: defineAction({
    input: idInput.extend(orderFields),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["update"], id);
      return yield* purchasingService.updateOrder(id, input, ownerOf(user.id, context), lockLocaleFrom(context.request.headers));
    })),
  }),
  transition: defineAction({
    input: idInput.extend({ to: z.enum(PURCHASE_ORDER_STATUSES) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["update"], input.id);
      return yield* purchasingService.transition(input.id, input.to, ownerOf(user.id, context), { locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  receive: defineAction({
    input: idInput.extend({
      supplierReference: optionalText(100),
      notes: optionalText(5000),
      lines: z.array(z.object({ lineId: z.uuid(), quantity: z.number().int().min(0).max(1_000_000) })).min(1).max(MAX_LINES),
    }),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["update"], id);
      return yield* purchasingService.receive(id, input, ownerOf(user.id, context), { locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  delete: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["delete"], id);
      return yield* purchasingService.deleteOrder(id, ownerOf(user.id, context), lockLocaleFrom(context.request.headers));
    })),
  }),
  lock: defineAction({
    input: idInput.extend({ takeOver: z.boolean().optional() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["update"], input.id);
      return yield* purchasingService.lock(input.id, ownerOf(user.id, context), { takeOver: input.takeOver, locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  unlock: defineAction({
    input: idInput,
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["update"], input.id);
      yield* purchasingService.unlock(input.id, ownerOf(user.id, context));
      return { success: true };
    })),
  }),
};
