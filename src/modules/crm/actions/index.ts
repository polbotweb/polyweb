/**
 * Actions Astro du domaine crm : prologue Effect (garde de permission tenant, verrou,
 * validations zod) puis service. Ré-exportées depuis `src/actions/index.ts` (`actions.crm.*`).
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { effectHandler } from "@/lib/effect/action";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { requireCrmPermission, requireCrmResourcePermission } from "../permissions";
import { crmService } from "../services/crm.service";
import { CRM_STAGES, LOST_REASONS } from "../domain/workflow";
import { ACTIVITY_KINDS } from "../domain/activities";
import { bulkCrmLifecycle } from "./bulk";

const idInput = z.object({ id: z.uuid() });
const orgInput = { organizationId: z.string().nullable().default(null) };
const optionalText = (max: number) => z.string().max(max).nullable().default(null);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ownerOf = (userId: string, context: { locals: { session?: { id: string } | null } }) => lockOwnerFrom(userId, context.locals.session?.id);

const companyFields = {
  name: z.string().trim().min(1).max(200),
  email: optionalText(254), phone: optionalText(40), website: optionalText(500), country: optionalText(2),
  vatNumber: optionalText(32), address: optionalText(1000), notes: optionalText(5000),
};
const contactFields = {
  firstName: optionalText(100), lastName: z.string().trim().min(1).max(200),
  email: optionalText(254), phone: optionalText(40), jobTitle: optionalText(200), companyId: z.uuid().nullable().default(null), notes: optionalText(5000),
};
const opportunityFields = {
  title: z.string().trim().min(1).max(200),
  companyId: z.uuid().nullable().default(null), contactId: z.uuid().nullable().default(null),
  amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  probability: z.number().int().min(0).max(100).nullable().default(null),
  expectedCloseDate: isoDate.nullable().default(null),
  notes: optionalText(5000),
};

export const crmActions = {
  bulk: bulkCrmLifecycle,

  createCompany: defineAction({
    input: z.object({ ...orgInput, ...companyFields }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireCrmPermission(context, ["create"], input.organizationId);
      return yield* crmService.createCompany(input, user.id);
    })),
  }),
  updateCompany: defineAction({
    input: idInput.extend(companyFields),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      yield* requireCrmResourcePermission(context, ["update"], id, "company");
      return yield* crmService.updateCompany(id, input);
    })),
  }),
  deleteCompany: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      yield* requireCrmResourcePermission(context, ["delete"], id, "company");
      return yield* crmService.deleteCompany(id);
    })),
  }),

  createContact: defineAction({
    input: z.object({ ...orgInput, ...contactFields }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireCrmPermission(context, ["create"], input.organizationId);
      return yield* crmService.createContact(input, user.id);
    })),
  }),
  updateContact: defineAction({
    input: idInput.extend(contactFields),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      yield* requireCrmResourcePermission(context, ["update"], id, "contact");
      return yield* crmService.updateContact(id, input);
    })),
  }),
  deleteContact: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      yield* requireCrmResourcePermission(context, ["delete"], id, "contact");
      return yield* crmService.deleteContact(id);
    })),
  }),

  create: defineAction({
    input: z.object({ ...orgInput, ...opportunityFields }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireCrmPermission(context, ["create"], input.organizationId);
      return yield* crmService.createOpportunity(input, user.id);
    })),
  }),
  update: defineAction({
    input: idInput.extend(opportunityFields),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      const user = yield* requireCrmResourcePermission(context, ["update"], id);
      return yield* crmService.updateOpportunity(id, input, ownerOf(user.id, context), lockLocaleFrom(context.request.headers));
    })),
  }),
  transition: defineAction({
    input: idInput.extend({ to: z.enum(CRM_STAGES), lostReason: z.enum(LOST_REASONS).nullable().default(null) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireCrmResourcePermission(context, ["update"], input.id);
      return yield* crmService.transition(input.id, input.to, ownerOf(user.id, context), { lostReason: input.lostReason, locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  linkQuote: defineAction({
    input: idInput.extend({ quoteId: z.uuid().nullable() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireCrmResourcePermission(context, ["update"], input.id);
      return yield* crmService.linkQuote(input.id, input.quoteId, ownerOf(user.id, context), lockLocaleFrom(context.request.headers));
    })),
  }),
  delete: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      const user = yield* requireCrmResourcePermission(context, ["delete"], id);
      return yield* crmService.deleteOpportunity(id, ownerOf(user.id, context), lockLocaleFrom(context.request.headers));
    })),
  }),
  lock: defineAction({
    input: idInput.extend({ takeOver: z.boolean().optional() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireCrmResourcePermission(context, ["update"], input.id);
      return yield* crmService.lock(input.id, ownerOf(user.id, context), { takeOver: input.takeOver, locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  unlock: defineAction({
    input: idInput,
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireCrmResourcePermission(context, ["update"], input.id);
      yield* crmService.unlock(input.id, ownerOf(user.id, context));
      return { success: true };
    })),
  }),

  createActivity: defineAction({
    input: z.object({
      ...orgInput,
      kind: z.enum(ACTIVITY_KINDS), subject: z.string().trim().min(1).max(200), body: optionalText(5000),
      dueAt: z.coerce.date().nullable().default(null),
      opportunityId: z.uuid().nullable().default(null), contactId: z.uuid().nullable().default(null), companyId: z.uuid().nullable().default(null),
    }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireCrmPermission(context, ["update"], input.organizationId);
      return yield* crmService.createActivity(input, user.id);
    })),
  }),
  completeActivity: defineAction({
    input: idInput.extend({ done: z.boolean() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      yield* requireCrmResourcePermission(context, ["update"], input.id, "activity");
      return yield* crmService.completeActivity(input.id, input.done);
    })),
  }),
  deleteActivity: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      yield* requireCrmResourcePermission(context, ["delete"], id, "activity");
      return yield* crmService.deleteActivity(id);
    })),
  }),
};
