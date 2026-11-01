/**
 * Actions Astro du domaine subscriptions (back-office) : garde de permission tenant-aware puis service.
 * Les actions du client final (souscrire, résilier, reprendre) passent par des routes du portail
 * avec contrôle de propriété (`public/routes.ts`), jamais par ces actions.
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { PaymentGatewayLive } from "@/core/payments/gateway";
import { effectHandler } from "@/lib/effect/action";
import { fromDecimal, parseCurrency } from "@/core/money";
import { defineCategoryActions } from "@/core/taxonomy/actions";
import { TAX_CATEGORIES, SUPPLY_TYPES } from "@/modules/tax/domain/rules";
import { requireSubscriptionsPermission, requireSubscriptionsResourcePermission } from "../permissions";
import { subscriptionsService } from "../services/subscription.service";
import { BILLING_INTERVALS } from "../domain/lifecycle";
import { subscriptionsCategoryTaxonomy } from "../taxonomy";

const idInput = z.object({ id: z.uuid() });
const planFields = {
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(1).max(80),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().default(null),
  taxCategory: z.enum(TAX_CATEGORIES).default("standard"),
  supplyType: z.enum(SUPPLY_TYPES).default("services"),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
};
const priceFields = {
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  // Montant TTC saisi en unités (« 19.90 ») ; converti en unités mineures selon l'exposant ISO 4217.
  amount: z.string().trim().regex(/^\d{1,9}(?:[.,]\d{1,3})?$/),
  interval: z.enum(BILLING_INTERVALS),
  intervalCount: z.number().int().min(1).max(12).default(1),
  trialDays: z.number().int().min(0).max(730).default(0),
};

export const subscriptionsActions = {
  // Catégories des formules (core/taxonomy) — voir ../taxonomy.ts.
  categories: defineCategoryActions(subscriptionsCategoryTaxonomy, "subscriptions"),
  createPlan: defineAction({
    input: z.object({ organizationId: z.string().nullable().default(null), ...planFields }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireSubscriptionsPermission(context, ["create"], input.organizationId);
      return yield* subscriptionsService.createPlan(input, user.id);
    })),
  }),
  updatePlan: defineAction({
    input: idInput.extend(planFields),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      const user = yield* requireSubscriptionsResourcePermission(context, ["update"], id, "plan");
      return yield* subscriptionsService.updatePlan(id, input, user.id);
    })),
  }),
  createPrice: defineAction({
    input: z.object({ planId: z.uuid(), ...priceFields }),
    handler: effectHandler(({ planId, amount, ...input }, context) => Effect.gen(function* () {
      const user = yield* requireSubscriptionsResourcePermission(context, ["update"], planId, "plan");
      const currency = yield* parseCurrency(input.currency.toUpperCase());
      const value = yield* fromDecimal(amount.replace(",", "."), currency);
      return yield* subscriptionsService.createPrice(planId, { ...input, currency, amountMinor: value.amountMinor }, user.id);
    })),
  }),
  setPriceActive: defineAction({
    input: idInput.extend({ active: z.boolean() }),
    handler: effectHandler(({ id, active }, context) => Effect.gen(function* () {
      const user = yield* requireSubscriptionsResourcePermission(context, ["update"], id, "price");
      return yield* subscriptionsService.setPriceActive(id, active, user.id);
    })),
  }),
  cancel: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      const user = yield* requireSubscriptionsResourcePermission(context, ["update"], id);
      return yield* subscriptionsService.cancel(id, user.id);
    }).pipe(Effect.provide(PaymentGatewayLive))),
  }),
  resume: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      const user = yield* requireSubscriptionsResourcePermission(context, ["update"], id);
      return yield* subscriptionsService.resume(id, user.id);
    }).pipe(Effect.provide(PaymentGatewayLive))),
  }),
  changePrice: defineAction({
    input: idInput.extend({ priceId: z.uuid(), prorate: z.boolean().default(true) }),
    handler: effectHandler(({ id, priceId, prorate }, context) => Effect.gen(function* () {
      const user = yield* requireSubscriptionsResourcePermission(context, ["update"], id);
      return yield* subscriptionsService.changePrice(id, priceId, prorate, user.id);
    }).pipe(Effect.provide(PaymentGatewayLive))),
  }),
};
