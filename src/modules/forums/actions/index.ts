/**
 * Actions Astro d'ADMINISTRATION des forums (API + tests ; les pages d'administration appellent
 * les mêmes services). Garde tenant (organisation + site) AVANT toute écriture ; chaque écriture
 * est auditée dans sa transaction par le service.
 *   - forums : create / update / transition / lock / unlock → permissions create / update / publish
 *   - catégories, étiquettes, politique de sanctions, levée de sanction → `configure` / `moderate`
 * Les actions de participation (sujets, réponses, votes…) sont dans `./community.ts`.
 */
import { defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { actionRateLimit, effectHandler, requireTenantPermission } from "@/lib/effect/action";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { forums, FORUM_VISIBILITIES } from "../schema";
import { categoriesService, forumsService, tagsService } from "../services/forum.service";
import { setSanctionPolicy, revokeSanction } from "../services/sanctions";
import { siteScope, notFound, type ForumsAction } from "../services/access";
import { FORUMS_STATUSES } from "../domain/workflow";
import { NOTE_MAX, NOTE_MIN } from "../domain/rules";

const id = z.string().min(1).max(64);
const slug = z.string().max(80);
const translations = z.record(z.enum(["fr", "en", "es", "ar"]), z.object({ name: z.string().max(80), description: z.string().max(300).optional() }));

/** Garde d'administration sur un site : permission forums dans la portée (organisation du site, site). */
export const requireSiteForums = (context: ActionAPIContext, siteId: string, actions: readonly ForumsAction[]) =>
  Effect.gen(function* () {
    const scope = yield* siteScope(siteId);
    const user = yield* requireTenantPermission(context, { forums: [...actions] }, scope.organizationId, scope.siteId);
    yield* actionRateLimit(user.id, "forums-admin", { window: 60, max: 60 });
    return { user, scope };
  });

/** Garde sur un forum existant (organisation + site lus en base). */
const requireForum = (context: ActionAPIContext, forumId: string, actions: readonly ForumsAction[]) =>
  Effect.gen(function* () {
    const [row] = yield* dbTry("forums.admin.forum", () => getDrizzle().select({ siteId: forums.siteId, organizationId: forums.organizationId }).from(forums).where(eq(forums.id, forumId)).limit(1));
    if (!row) return yield* notFound();
    const user = yield* requireTenantPermission(context, { forums: [...actions] }, row.organizationId, row.siteId);
    yield* actionRateLimit(user.id, "forums-admin", { window: 60, max: 60 });
    return user;
  });

const owner = (context: ActionAPIContext, userId: string) => lockOwnerFrom(userId, context.locals.session?.id);

export const forumsActions = {
  create: defineAction({
    input: z.object({ siteId: id, title: z.string().trim().min(2).max(160), slug: slug.default(""), description: z.string().max(500).nullable().optional(), visibility: z.enum(FORUM_VISIBILITIES).default("public") }),
    handler: effectHandler(({ siteId, ...input }, context) => Effect.gen(function* () {
      const { user, scope } = yield* requireSiteForums(context, siteId, ["create"]);
      return yield* forumsService.create(scope, input, user.id);
    })),
  }),
  update: defineAction({
    input: z.object({ id, title: z.string().trim().min(2).max(160).optional(), slug: slug.optional(), description: z.string().max(500).nullable().optional(), visibility: z.enum(FORUM_VISIBILITIES).optional(), position: z.number().int().min(0).max(10_000).optional() }),
    handler: effectHandler(({ id: forumId, ...patch }, context) => Effect.gen(function* () {
      const user = yield* requireForum(context, forumId, ["update"]);
      return yield* forumsService.update(forumId, patch, owner(context, user.id), lockLocaleFrom(context.request.headers));
    })),
  }),
  transition: defineAction({
    input: z.object({ id, to: z.enum(FORUMS_STATUSES) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireForum(context, input.id, input.to === "PUBLISHED" ? ["publish"] : ["update"]);
      return yield* forumsService.transition(input.id, input.to, owner(context, user.id), lockLocaleFrom(context.request.headers));
    })),
  }),
  lock: defineAction({
    input: z.object({ id, takeOver: z.boolean().optional() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireForum(context, input.id, ["update"]);
      return yield* forumsService.lock(input.id, owner(context, user.id), { takeOver: input.takeOver, locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  unlock: defineAction({
    input: z.object({ id }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireForum(context, input.id, ["update"]);
      yield* forumsService.unlock(input.id, owner(context, user.id));
      return { success: true };
    })),
  }),
  categoryCreate: defineAction({
    input: z.object({ siteId: id, forumId: id, slug: slug.default(""), translations }),
    handler: effectHandler(({ siteId, ...input }, context) => Effect.gen(function* () {
      const { user } = yield* requireSiteForums(context, siteId, ["configure"]);
      return yield* categoriesService.create(siteId, input, user.id);
    })),
  }),
  categoryUpdate: defineAction({
    input: z.object({ siteId: id, categoryId: id, translations }),
    handler: effectHandler(({ siteId, ...input }, context) => Effect.gen(function* () {
      const { user } = yield* requireSiteForums(context, siteId, ["configure"]);
      return yield* categoriesService.update(siteId, input, user.id);
    })),
  }),
  categoryMove: defineAction({
    input: z.object({ siteId: id, categoryId: id, direction: z.enum(["up", "down"]) }),
    handler: effectHandler(({ siteId, ...input }, context) => Effect.gen(function* () {
      const { user } = yield* requireSiteForums(context, siteId, ["configure"]);
      return yield* categoriesService.move(siteId, input, user.id);
    })),
  }),
  categoryDelete: defineAction({
    input: z.object({ siteId: id, categoryId: id, moveTo: id.nullable().default(null) }),
    handler: effectHandler(({ siteId, ...input }, context) => Effect.gen(function* () {
      const { user } = yield* requireSiteForums(context, siteId, ["configure"]);
      return yield* categoriesService.remove(siteId, input, user.id);
    })),
  }),
  tagCreate: defineAction({
    input: z.object({ siteId: id, label: z.string().trim().min(2).max(40) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const { user, scope } = yield* requireSiteForums(context, input.siteId, ["configure"]);
      return yield* tagsService.create(scope, { label: input.label }, user.id);
    })),
  }),
  tagDelete: defineAction({
    input: z.object({ siteId: id, tagId: id }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const { user, scope } = yield* requireSiteForums(context, input.siteId, ["configure"]);
      return yield* tagsService.remove(scope, input.tagId, user.id);
    })),
  }),
  sanctionPolicySet: defineAction({
    input: z.object({
      siteId: id, enabled: z.boolean(), windowDays: z.number().int(), muteThreshold: z.number().int(), muteHours: z.number().int(),
      suspendThreshold: z.number().int(), suspendDays: z.number().int(),
    }),
    handler: effectHandler(({ siteId, ...policy }, context) => Effect.gen(function* () {
      const { user, scope } = yield* requireSiteForums(context, siteId, ["configure"]);
      return yield* setSanctionPolicy({ siteId, organizationId: scope.organizationId, actorId: user.id, policy });
    })),
  }),
  sanctionRevoke: defineAction({
    input: z.object({ siteId: id, sanctionId: id, note: z.string().trim().min(NOTE_MIN).max(NOTE_MAX) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const { user, scope } = yield* requireSiteForums(context, input.siteId, ["moderate"]);
      return yield* revokeSanction({ sanctionId: input.sanctionId, siteId: input.siteId, organizationId: scope.organizationId, actorId: user.id, note: input.note });
    })),
  }),
};
