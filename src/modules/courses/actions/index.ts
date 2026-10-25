/**
 * Actions Astro du domaine courses : prologue Effect (garde de permission,
 * verrou, validations) puis service. À ré-exporter depuis `src/actions/index.ts`.
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { effectHandler } from "@/lib/effect/action";
import { defineCategoryActions } from "@/core/taxonomy/actions";
import { coursesCategoryTaxonomy } from "../taxonomy";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { requireCoursesPermission, requireCoursesResourcePermission } from "../permissions";
import { coursesService } from "../services/course.service";
import { COURSES_STATUSES } from "../domain/workflow";
import { bulkCoursesLifecycle } from "./bulk";

const idInput = z.object({ id: z.uuid() });

export const coursesActions = {
  // Catégories (core/taxonomy) — voir ../taxonomy.ts.
  categories: defineCategoryActions(coursesCategoryTaxonomy, "courses"),
  // Actions groupées (core/bulk) — voir ./bulk.ts.
  bulk: bulkCoursesLifecycle,
  create: defineAction({
    input: z.object({ title: z.string().min(1).max(200), slug: z.string().min(1).max(200), organizationId: z.string().nullable().default(null) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireCoursesPermission(context, ["create"], input.organizationId);
      return yield* coursesService.create(input, user.id);
    })),
  }),
  update: defineAction({
    input: idInput.extend({ title: z.string().min(1).max(200).optional(), slug: z.string().min(1).max(200).optional() }),
    handler: effectHandler(({ id, ...patch }, context) => Effect.gen(function* () {
      const user = yield* requireCoursesResourcePermission(context, ["update"], id);
      return yield* coursesService.update(id, patch, lockOwnerFrom(user.id, context.locals.session?.id), lockLocaleFrom(context.request.headers));
    })),
  }),
  transition: defineAction({
    input: idInput.extend({ to: z.enum(COURSES_STATUSES) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireCoursesResourcePermission(context, input.to === "PUBLISHED" ? ["publish"] : ["update"], input.id);
      return yield* coursesService.transition(input.id, input.to, lockOwnerFrom(user.id, context.locals.session?.id), lockLocaleFrom(context.request.headers));
    })),
  }),
  lock: defineAction({
    input: idInput.extend({ takeOver: z.boolean().optional() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireCoursesResourcePermission(context, ["update"], input.id);
      // Même utilisateur dans une autre session → LockHeldError { sameUser } : confirmer côté UI puis renvoyer takeOver.
      return yield* coursesService.lock(input.id, lockOwnerFrom(user.id, context.locals.session?.id), { takeOver: input.takeOver, locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  unlock: defineAction({
    input: idInput,
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireCoursesResourcePermission(context, ["update"], input.id);
      yield* coursesService.unlock(input.id, lockOwnerFrom(user.id, context.locals.session?.id));
      return { success: true };
    })),
  }),
};
