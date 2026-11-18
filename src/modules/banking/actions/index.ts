/**
 * Actions Astro du domaine banking : prologue Effect (garde de permission,
 * verrou, validations) puis service. À ré-exporter depuis `src/actions/index.ts`.
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { effectHandler } from "@/lib/effect/action";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { requireBankingPermission, requireBankingResourcePermission } from "../permissions";
import { bankingService } from "../services/statement.service";
import { BANKING_STATUSES } from "../domain/workflow";
import { bulkBankingLifecycle } from "./bulk";

const idInput = z.object({ id: z.uuid() });

export const bankingActions = {
  // Actions groupées (core/bulk) — voir ./bulk.ts.
  bulk: bulkBankingLifecycle,
  create: defineAction({
    input: z.object({ title: z.string().min(1).max(200), slug: z.string().min(1).max(200), organizationId: z.string().nullable().default(null) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["create"], input.organizationId);
      return yield* bankingService.create(input, user.id);
    })),
  }),
  update: defineAction({
    input: idInput.extend({ title: z.string().min(1).max(200).optional(), slug: z.string().min(1).max(200).optional() }),
    handler: effectHandler(({ id, ...patch }, context) => Effect.gen(function* () {
      const user = yield* requireBankingResourcePermission(context, ["update"], id);
      return yield* bankingService.update(id, patch, lockOwnerFrom(user.id, context.locals.session?.id), lockLocaleFrom(context.request.headers));
    })),
  }),
  transition: defineAction({
    input: idInput.extend({ to: z.enum(BANKING_STATUSES) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingResourcePermission(context, input.to === "PUBLISHED" ? ["publish"] : ["update"], input.id);
      return yield* bankingService.transition(input.id, input.to, lockOwnerFrom(user.id, context.locals.session?.id), lockLocaleFrom(context.request.headers));
    })),
  }),
  lock: defineAction({
    input: idInput.extend({ takeOver: z.boolean().optional() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingResourcePermission(context, ["update"], input.id);
      // Même utilisateur dans une autre session → LockHeldError { sameUser } : confirmer côté UI puis renvoyer takeOver.
      return yield* bankingService.lock(input.id, lockOwnerFrom(user.id, context.locals.session?.id), { takeOver: input.takeOver, locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  unlock: defineAction({
    input: idInput,
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingResourcePermission(context, ["update"], input.id);
      yield* bankingService.unlock(input.id, lockOwnerFrom(user.id, context.locals.session?.id));
      return { success: true };
    })),
  }),
};
