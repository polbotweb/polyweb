/**
 * Actions Astro des petites annonces (tests / clients JS). Les pages HTML appellent
 * les mêmes services via les formulaires POST (`web/forms.ts`, `web/admin-forms.ts`).
 */
import { defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { effectHandler, requireTenantPermission, actionRateLimit } from "@/lib/effect/action";
import { CLASSIFIED_CONDITIONS, CLASSIFIED_KINDS, CLASSIFIED_PRICE_KINDS, CLASSIFIED_VISIBILITIES } from "../domain/workflow";
import { siteScope } from "../services/access";
import { approveAd, archiveAd, createAd, markSold, rejectAd, renewAd, submitAd, updateAd, withdrawAd } from "../services/ad.service";
import { startInquiry } from "../services/inquiry";
import { deleteSavedSearch, saveSearch, setSavedSearchNotify, toggleFavorite } from "../services/engagement";
import { updateSiteSettings } from "../services/settings";

const id = z.string().min(1).max(64);
const viewerOf = (context: ActionAPIContext) => context.locals.user ?? null;

const requireConfigure = (context: ActionAPIContext, siteId: string) =>
  Effect.gen(function* () {
    const scope = yield* siteScope(siteId);
    const user = yield* requireTenantPermission(context, { classifieds: ["configure"] }, scope.organizationId, scope.siteId);
    yield* actionRateLimit(user.id, "classifieds-admin", { window: 60, max: 60 });
    return { user, scope };
  });

export const classifiedsActions = {
  create: defineAction({
    input: z.object({
      siteId: id, categoryId: id, title: z.string(), body: z.string(), kind: z.enum(CLASSIFIED_KINDS), condition: z.enum(CLASSIFIED_CONDITIONS),
      priceKind: z.enum(CLASSIFIED_PRICE_KINDS), price: z.string().optional(), currency: z.string().optional(),
      city: z.string(), postalCode: z.string().optional(), country: z.string().optional(),
      media: z.array(z.object({ mediaId: z.string(), altText: z.string() })).default([]),
      attributes: z.array(z.object({ definitionId: z.string(), text: z.string().nullable().optional(), number: z.number().nullable().optional(), boolean: z.boolean().nullable().optional(), date: z.string().nullable().optional(), optionId: z.string().nullable().optional(), optionIds: z.array(z.string()).optional() })).default([]),
      submit: z.boolean().optional(),
    }),
    handler: effectHandler((input, context) => createAd(input.siteId, viewerOf(context), input)),
  }),
  update: defineAction({
    input: z.object({
      id, categoryId: id, title: z.string(), body: z.string(), kind: z.enum(CLASSIFIED_KINDS), condition: z.enum(CLASSIFIED_CONDITIONS),
      priceKind: z.enum(CLASSIFIED_PRICE_KINDS), price: z.string().optional(), currency: z.string().optional(),
      city: z.string(), postalCode: z.string().optional(), country: z.string().optional(),
      media: z.array(z.object({ mediaId: z.string(), altText: z.string() })).default([]),
      attributes: z.array(z.object({ definitionId: z.string(), text: z.string().nullable().optional(), number: z.number().nullable().optional(), boolean: z.boolean().nullable().optional(), date: z.string().nullable().optional(), optionId: z.string().nullable().optional(), optionIds: z.array(z.string()).optional() })).default([]),
    }),
    handler: effectHandler((input, context) => updateAd(input.id, viewerOf(context), input)),
  }),
  submit: defineAction({ input: z.object({ id }), handler: effectHandler((input, context) => submitAd(input.id, viewerOf(context))) }),
  sold: defineAction({ input: z.object({ id }), handler: effectHandler((input, context) => markSold(input.id, viewerOf(context))) }),
  archive: defineAction({ input: z.object({ id }), handler: effectHandler((input, context) => archiveAd(input.id, viewerOf(context))) }),
  withdraw: defineAction({ input: z.object({ id }), handler: effectHandler((input, context) => withdrawAd(input.id, viewerOf(context))) }),
  renew: defineAction({ input: z.object({ id }), handler: effectHandler((input, context) => renewAd(input.id, viewerOf(context))) }),
  approve: defineAction({ input: z.object({ id }), handler: effectHandler((input, context) => approveAd(input.id, viewerOf(context))) }),
  reject: defineAction({ input: z.object({ id }), handler: effectHandler((input, context) => rejectAd(input.id, viewerOf(context))) }),
  favorite: defineAction({ input: z.object({ id }), handler: effectHandler((input, context) => toggleFavorite(input.id, viewerOf(context))) }),
  inquire: defineAction({ input: z.object({ id, body: z.string() }), handler: effectHandler((input, context) => startInquiry(input.id, viewerOf(context), input.body)) }),
  saveSearch: defineAction({
    input: z.object({ siteId: id, name: z.string().optional(), query: z.string().optional(), categoryId: id.optional(), kind: z.enum(CLASSIFIED_KINDS).optional(), notify: z.boolean().optional() }),
    handler: effectHandler((input, context) => saveSearch(input.siteId, viewerOf(context), input)),
  }),
  deleteSavedSearch: defineAction({ input: z.object({ id }), handler: effectHandler((input, context) => deleteSavedSearch(input.id, viewerOf(context))) }),
  setSavedSearchNotify: defineAction({ input: z.object({ id, notify: z.boolean() }), handler: effectHandler((input, context) => setSavedSearchNotify(input.id, viewerOf(context), input.notify)) }),
  updateSettings: defineAction({
    input: z.object({
      siteId: id, visibility: z.enum(CLASSIFIED_VISIBILITIES), preModeration: z.boolean(), durationDays: z.number().int(),
      defaultCurrency: z.string(), maxImages: z.number().int(), maxRenewals: z.number().int(),
    }),
    handler: effectHandler(({ siteId, ...patch }, context) => Effect.gen(function* () {
      const { user, scope } = yield* requireConfigure(context, siteId);
      return yield* updateSiteSettings(scope, user.id, patch);
    })),
  }),
};
