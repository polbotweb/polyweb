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
import { CUSTOMER_TYPES, TAX_CATEGORIES } from "../domain/rules";
import { bulkTaxLifecycle } from "./bulk";

const idInput = z.object({ id: z.uuid() });

/** Champs d'un taux : pays ISO 3166-1 alpha-2, taux décimal 0–100 (4 décimales max), dates ISO. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rateFields = {
  countryCode: z.string().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
  category: z.enum(TAX_CATEGORIES),
  customerType: z.enum(CUSTOMER_TYPES).nullable(),
  ratePercent: z.string().trim().regex(/^\d{1,3}([.,]\d{1,4})?$/).transform((value) => value.replace(",", ".")).refine((value) => Number(value) <= 100, "Taux ≤ 100 %"),
  validFrom: isoDate.nullable(),
  validTo: isoDate.nullable(),
};
const validRange = (value: { validFrom?: string | null; validTo?: string | null }) => !value.validFrom || !value.validTo || value.validTo > value.validFrom;

export const taxActions = {
  // Actions groupées (core/bulk) — voir ./bulk.ts.
  bulk: bulkTaxLifecycle,
  create: defineAction({
    input: z.object({ title: z.string().min(1).max(200), slug: z.string().min(1).max(200), organizationId: z.string().nullable().default(null), ...rateFields, customerType: rateFields.customerType.default(null), validFrom: rateFields.validFrom.default(null), validTo: rateFields.validTo.default(null) }).refine(validRange, { message: "La fin de validité doit suivre le début.", path: ["validTo"] }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireTaxPermission(context, ["create"], input.organizationId);
      return yield* taxService.create(input, user.id);
    })),
  }),
  update: defineAction({
    input: idInput.extend({ title: z.string().min(1).max(200).optional(), slug: z.string().min(1).max(200).optional(), countryCode: rateFields.countryCode.optional(), category: rateFields.category.optional(), customerType: rateFields.customerType.optional(), ratePercent: rateFields.ratePercent.optional(), validFrom: rateFields.validFrom.optional(), validTo: rateFields.validTo.optional() }).refine(validRange, { message: "La fin de validité doit suivre le début.", path: ["validTo"] }),
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
