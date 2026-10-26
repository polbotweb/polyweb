/**
 * Actions Astro du domaine tax : prologue Effect (garde de permission,
 * verrou, validations) puis service. À ré-exporter depuis `src/actions/index.ts`.
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { effectHandler } from "@/lib/effect/action";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { requireTaxPermission, requireTaxResourcePermission } from "../permissions";
import { taxService } from "../services/tax-rate.service";
import { TAX_STATUSES } from "../domain/workflow";
import { bulkTaxLifecycle } from "./bulk";

const idInput = z.object({ id: z.uuid() });

export const taxActions = {
  // Actions groupées (core/bulk) — voir ./bulk.ts.
  bulk: bulkTaxLifecycle,
  create: defineAction({
    input: z.object({ title: z.string().min(1).max(200), slug: z.string().min(1).max(200), organizationId: z.string().nullable().default(null) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireTaxPermission(context, ["create"], input.organizationId);
      return yield* taxService.create(input, user.id);
    })),
  }),
  update: defineAction({
    input: idInput.extend({ title: z.string().min(1).max(200).optional(), slug: z.string().min(1).max(200).optional() }),
    handler: effectHandler(({ id, ...patch }, context) => Effect.gen(function* () {
      const user = yield* requireTaxResourcePermission(context, ["update"], id);
      return yield* taxService.update(id, patch, lockOwnerFrom(user.id, context.locals.session?.id), lockLocaleFrom(context.request.headers));
    })),
  }),
  transition: defineAction({
    input: idInput.extend({ to: z.enum(TAX_STATUSES) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireTaxResourcePermission(context, input.to === "PUBLISHED" ? ["publish"] : ["update"], input.id);
      return yield* taxService.transition(input.id, input.to, lockOwnerFrom(user.id, context.locals.session?.id), lockLocaleFrom(context.request.headers));
    })),
  }),
  lock: defineAction({
    input: idInput.extend({ takeOver: z.boolean().optional() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireTaxResourcePermission(context, ["update"], input.id);
      // Même utilisateur dans une autre session → LockHeldError { sameUser } : confirmer côté UI puis renvoyer takeOver.
      return yield* taxService.lock(input.id, lockOwnerFrom(user.id, context.locals.session?.id), { takeOver: input.takeOver, locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  unlock: defineAction({
    input: idInput,
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireTaxResourcePermission(context, ["update"], input.id);
      yield* taxService.unlock(input.id, lockOwnerFrom(user.id, context.locals.session?.id));
      return { success: true };
    })),
  }),
};
