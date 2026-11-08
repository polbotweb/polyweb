/**
 * Actions de modération générique (docs/moderation.md) :
 * - `moderation.report` : signalement public (dédoublonné, limité en débit, réponse identique pour
 *   une cible absente / invisible / d'un autre tenant ; jamais d'identité de signaleur en retour) ;
 * - `moderation.decide` : hide / restore / spam, motivé ;
 * - `moderation.resolve` : clôture motivée des signalements d'une cible (resolved / dismissed).
 * Autorisation par cible (organisation, site, permission de l'adaptateur) ; un refus est rendu
 * comme une cible introuvable. Le temps de réponse n'est pas garanti constant.
 */
import { defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { MODERATION_REPORT_REASONS } from "@database/schemas/moderation.schema";
import { getModerationTarget, MODERATION_DECISIONS, MODERATION_OUTCOMES } from "@/core/moderation/registry";
import { decideModeration, moderationScope, MODERATION_DESCRIPTION_MAX, MODERATION_NOTE_MAX, resolveModerationReports, submitReport } from "@/core/moderation/service";
import { reporterKey } from "@/core/moderation/reporter-key";
import { appConfigFrom } from "@/lib/effect/config";
import { registerModerationTargets } from "@/modules/moderation";
import { extractIp } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { ActionFailure, actionRateLimit, effectHandler, fail, requireTenantPermission, requireUser } from "@/lib/effect/action";

const NOT_FOUND = "Élément introuvable.";
const targetKey = z.string().min(3).max(81).regex(/^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/);
const targetId = z.string().min(1).max(64);
const note = z.string().trim().min(3).max(MODERATION_NOTE_MAX);

/** Erreurs du cœur → codes d'action ; refus d'accès et cible absente indiscernables. */
const toActionFailure = (error: unknown) => {
  const tag = (error as { _tag?: string })._tag;
  if (tag === "ModerationUnavailableError") return new ActionFailure({ code: "NOT_FOUND", message: NOT_FOUND });
  if (tag === "ModerationUnsupportedError") return new ActionFailure({ code: "BAD_REQUEST", message: (error as { message: string }).message });
  if (error instanceof ActionFailure && error.code === "FORBIDDEN") return new ActionFailure({ code: "NOT_FOUND", message: NOT_FOUND });
  return error;
};

const reportInput = z.object({
  target: targetKey,
  id: targetId,
  reason: z.enum(MODERATION_REPORT_REASONS),
  description: z.string().max(MODERATION_DESCRIPTION_MAX).optional().nullable(),
});

/** Signalement : même logique que les façades historiques `createBlogReport` / `createServiceReport`. */
export const reportModerationTarget = (input: z.infer<typeof reportInput>, context: ActionAPIContext) =>
  Effect.gen(function* () {
    registerModerationTargets();
    const target = getModerationTarget(input.target);
    if (!target) return yield* fail("NOT_FOUND", NOT_FOUND);
    const user = context.locals.user ?? null;
    if (target.reporters === "authenticated" && !user) return yield* fail("UNAUTHORIZED", "Vous devez être connecté pour effectuer cette action.");
    const key = reporterKey(user ? { userId: user.id } : { ip: extractIp(context.request.headers, context.clientAddress) }, appConfigFrom(process.env).signingSecret);
    // Clé de débit = empreinte (ni IP ni identifiant en clair dans le limiteur).
    if (!checkRateLimit(`moderation-report:${key}`, { window: 600, max: 10 }).allowed) return yield* fail("TOO_MANY_REQUESTS", "Trop de signalements. Veuillez réessayer plus tard.");
    return yield* submitReport({ key: input.target, targetId: input.id, reason: input.reason, description: input.description ?? null, reporterId: user?.id ?? null, reporterKey: key });
  }).pipe(Effect.mapError(toActionFailure));

const guardTarget = (context: ActionAPIContext, key: string, id: string) =>
  Effect.gen(function* () {
    registerModerationTargets();
    const user = yield* requireUser(context);
    yield* actionRateLimit(user.id, "moderation", { window: 60, max: 60 });
    const scope = yield* moderationScope(key, id);
    yield* requireTenantPermission(context, scope.target.permission as Record<string, string[]>, scope.organizationId, scope.siteId);
    return { user, scope };
  });

export const moderation = {
  report: defineAction({ input: reportInput, handler: effectHandler(reportModerationTarget) }),

  decide: defineAction({
    input: z.object({ target: targetKey, id: targetId, decision: z.enum(MODERATION_DECISIONS), reasonCode: z.enum(MODERATION_REPORT_REASONS).optional().nullable(), note }),
    handler: effectHandler((input, context) =>
      Effect.gen(function* () {
        const { user, scope } = yield* guardTarget(context, input.target, input.id);
        return yield* decideModeration({ key: input.target, targetId: input.id, decision: input.decision, actorId: user.id, organizationId: scope.organizationId, reasonCode: input.reasonCode ?? null, note: input.note });
      }).pipe(Effect.mapError(toActionFailure)),
    ),
  }),

  resolve: defineAction({
    input: z.object({ target: targetKey, id: targetId, outcome: z.enum(MODERATION_OUTCOMES), note }),
    handler: effectHandler((input, context) =>
      Effect.gen(function* () {
        const { user, scope } = yield* guardTarget(context, input.target, input.id);
        return yield* resolveModerationReports({ key: input.target, targetId: input.id, outcome: input.outcome, actorId: user.id, organizationId: scope.organizationId, siteId: scope.siteId, note: input.note });
      }).pipe(Effect.mapError(toActionFailure)),
    ),
  }),
};
