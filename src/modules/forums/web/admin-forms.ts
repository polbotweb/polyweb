/**
 * Formulaires des pages d'administration des forums (POST en frontmatter → 303). Chaque intention
 * vérifie la permission forums DANS la portée du site administré (organisation du site + site),
 * applique la limite de débit d'administration, puis appelle le service (audit transactionnel).
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { lockOwnerFrom } from "@/core/locks/service";
import { actionRateLimit } from "@/lib/effect/action";
import { fail } from "@/lib/effect/failure";
import { dbTry } from "@/lib/effect/run";
import { runAppResult } from "@/lib/effect/http";
import { forums, FORUM_VISIBILITIES, type ForumCategoryTranslations } from "../schema";
import { FORUMS_STATUSES } from "../domain/workflow";
import { categoriesService, forumsService, tagsService } from "../services/forum.service";
import { revokeSanction, setSanctionPolicy } from "../services/sanctions";
import { forumsCan, notFound, type ForumsAction, type ForumViewer } from "../services/access";
import type { FormOutcome } from "./forms";

export const FORUM_LOCALES = ["fr", "en", "es", "ar"] as const;

export interface AdminFormContext {
  readonly viewer: NonNullable<ForumViewer>;
  readonly sessionId: string | null;
  readonly site: { readonly id: string; readonly organizationId: string | null };
}

const text = (form: FormData, name: string, max: number) => String(form.get(name) ?? "").trim().slice(0, max);
const int = (form: FormData, name: string) => Number.parseInt(String(form.get(name) ?? ""), 10);

const translationsFrom = (form: FormData): ForumCategoryTranslations =>
  Object.fromEntries(FORUM_LOCALES.map((l) => [l, { name: text(form, `name_${l}`, 80), description: text(form, `description_${l}`, 300) }]).filter(([, v]) => (v as { name: string }).name));

const guard = (ctx: AdminFormContext, actions: readonly ForumsAction[]) =>
  Effect.gen(function* () {
    const scope = { organizationId: ctx.site.organizationId, siteId: ctx.site.id };
    if (!(yield* forumsCan(ctx.viewer, scope, actions))) return yield* fail("FORBIDDEN", "Action non autorisée.");
    yield* actionRateLimit(ctx.viewer.id, "forums-admin", { window: 60, max: 60 });
    return scope;
  });

/** Forum du site administré (sinon NOT_FOUND). */
const siteForum = (ctx: AdminFormContext, forumId: string) =>
  dbTry("forums.admin.siteForum", () => getDrizzle().select({ id: forums.id, siteId: forums.siteId }).from(forums).where(eq(forums.id, forumId)).limit(1)).pipe(
    Effect.flatMap(([row]) => (row && row.siteId === ctx.site.id ? Effect.succeed(row.id) : notFound())),
  );

const run = async (effect: Effect.Effect<unknown, unknown, never>, notice: string): Promise<FormOutcome> => {
  const result = await runAppResult(effect);
  if (result.ok) return { ok: true, notice };
  const error = result.error as { _tag?: string; code?: string };
  return { ok: false, error: error._tag === "ActionFailure" && error.code ? error.code : error._tag === "LockHeldError" ? "CONFLICT" : "default" };
};

export const handleAdminForumsForm = (form: FormData, ctx: AdminFormContext): Promise<FormOutcome> => {
  const owner = lockOwnerFrom(ctx.viewer.id, ctx.sessionId ?? undefined);
  const visibility = FORUM_VISIBILITIES.find((v) => v === form.get("visibility"));
  switch (String(form.get("intent") ?? "")) {
    case "forumCreate":
      return run(Effect.gen(function* () {
        const scope = yield* guard(ctx, ["create"]);
        if (!visibility) return yield* fail("BAD_REQUEST", "Visibilité invalide.");
        return yield* forumsService.create(scope, { title: text(form, "title", 160), slug: text(form, "slug", 80), description: text(form, "description", 500) || null, visibility }, ctx.viewer.id);
      }), "saved");
    case "forumUpdate":
      return run(Effect.gen(function* () {
        yield* guard(ctx, ["update"]);
        const forumId = yield* siteForum(ctx, text(form, "forumId", 64));
        if (!visibility) return yield* fail("BAD_REQUEST", "Visibilité invalide.");
        const title = text(form, "title", 160);
        if (title.length < 2) return yield* fail("BAD_REQUEST", "Titre obligatoire.");
        return yield* forumsService.update(forumId, { title, slug: text(form, "slug", 80) || undefined, description: text(form, "description", 500) || null, visibility }, owner);
      }), "saved");
    case "forumTransition": {
      const to = FORUMS_STATUSES.find((s) => s === form.get("to"));
      return run(Effect.gen(function* () {
        if (!to) return yield* fail("BAD_REQUEST", "Statut invalide.");
        yield* guard(ctx, to === "PUBLISHED" ? ["publish"] : ["update"]);
        const forumId = yield* siteForum(ctx, text(form, "forumId", 64));
        return yield* forumsService.transition(forumId, to, owner);
      }), "saved");
    }
    case "categoryCreate":
      return run(Effect.gen(function* () {
        yield* guard(ctx, ["configure"]);
        return yield* categoriesService.create(ctx.site.id, { forumId: text(form, "forumId", 64), slug: text(form, "slug", 80), translations: translationsFrom(form) }, ctx.viewer.id);
      }), "saved");
    case "categoryUpdate":
      return run(Effect.gen(function* () {
        yield* guard(ctx, ["configure"]);
        return yield* categoriesService.update(ctx.site.id, { categoryId: text(form, "categoryId", 64), translations: translationsFrom(form) }, ctx.viewer.id);
      }), "saved");
    case "categoryMove": {
      const direction = form.get("direction") === "up" ? "up" : "down";
      return run(Effect.gen(function* () {
        yield* guard(ctx, ["configure"]);
        return yield* categoriesService.move(ctx.site.id, { categoryId: text(form, "categoryId", 64), direction }, ctx.viewer.id);
      }), "saved");
    }
    case "categoryDelete":
      return run(Effect.gen(function* () {
        yield* guard(ctx, ["configure"]);
        return yield* categoriesService.remove(ctx.site.id, { categoryId: text(form, "categoryId", 64), moveTo: text(form, "moveTo", 64) || null }, ctx.viewer.id);
      }), "deleted");
    case "tagCreate":
      return run(Effect.gen(function* () {
        const scope = yield* guard(ctx, ["configure"]);
        const label = text(form, "label", 40);
        if (label.length < 2) return yield* fail("BAD_REQUEST", "Libellé obligatoire.");
        return yield* tagsService.create(scope, { label }, ctx.viewer.id);
      }), "saved");
    case "tagDelete":
      return run(Effect.gen(function* () {
        const scope = yield* guard(ctx, ["configure"]);
        return yield* tagsService.remove(scope, text(form, "tagId", 64), ctx.viewer.id);
      }), "deleted");
    case "policySet":
      return run(Effect.gen(function* () {
        const scope = yield* guard(ctx, ["configure"]);
        const policy = { enabled: form.get("enabled") === "on", windowDays: int(form, "windowDays"), muteThreshold: int(form, "muteThreshold"), muteHours: int(form, "muteHours"), suspendThreshold: int(form, "suspendThreshold"), suspendDays: int(form, "suspendDays") };
        return yield* setSanctionPolicy({ siteId: scope.siteId, organizationId: scope.organizationId, actorId: ctx.viewer.id, policy });
      }), "saved");
    case "sanctionRevoke":
      return run(Effect.gen(function* () {
        const scope = yield* guard(ctx, ["moderate"]);
        return yield* revokeSanction({ sanctionId: text(form, "sanctionId", 64), siteId: scope.siteId, organizationId: scope.organizationId, actorId: ctx.viewer.id, note: text(form, "note", 1000) });
      }), "revoked");
    default:
      return Promise.resolve({ ok: false, error: "BAD_REQUEST" });
  }
};
