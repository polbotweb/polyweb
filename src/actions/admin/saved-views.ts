/**
 * Vues enregistrées des listes admin (core/filters) — actions Effect.
 * - la requête est CANONICALISÉE côté serveur avec la définition de la liste (jamais stockée brute) ;
 * - propriété stricte : lecture/suppression/renommage limités à l'auteur (sinon FORBIDDEN, sans fuite d'existence) ;
 * - lecture de la ressource exigée (RBAC global, ou appartenance à l'organisation) ;
 * - au plus MAX_SAVED_VIEWS vues par utilisateur, ressource et tenant ; noms uniques.
 */
import { Effect } from "effect";
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { adminSavedViews, member } from "@database/schemas";
import { canonicalListQuery } from "@/core/filters";
import { actionRateLimit, actionTry, effectHandler, fail, requireActionPermission, requireUser } from "@/lib/effect/action";
import { ADMIN_LISTS, ADMIN_LIST_IDS } from "@/lib/admin/list-registry";
import type { ActionAPIContext } from "astro:actions";

export const MAX_SAVED_VIEWS = 20;
const resourceSchema = z.enum(ADMIN_LIST_IDS);
const orgSchema = z.string().min(1).max(200).nullable().default(null);
const tenantOf = (organizationId: string | null) => (organizationId === null ? isNull(adminSavedViews.organizationId) : eq(adminSavedViews.organizationId, organizationId));

/** Accès en lecture à la liste : RBAC global hors organisation, appartenance sinon. */
const requireListAccess = (context: ActionAPIContext, resource: string, organizationId: string | null) =>
  Effect.gen(function* () {
    if (organizationId === null) return yield* requireActionPermission(context, ADMIN_LISTS[resource]!.readPermission);
    const user = yield* requireUser(context);
    const [row] = yield* actionTry("savedViews.membership", () => getDrizzle().select({ id: member.id }).from(member).where(and(eq(member.userId, user.id), eq(member.organizationId, organizationId))).limit(1));
    if (!row && user.role !== "admin") return yield* fail("FORBIDDEN", "Accès refusé à cette organisation.");
    return user;
  });

const ownedView = (id: string, userId: string) =>
  Effect.gen(function* () {
    const [view] = yield* actionTry("savedViews.load", () => getDrizzle().select().from(adminSavedViews).where(eq(adminSavedViews.id, id)).limit(1));
    // Même réponse pour « inexistante » et « appartient à un autre » : pas de fuite d'existence.
    if (!view || view.userId !== userId) return yield* fail("FORBIDDEN", "Vue introuvable ou non autorisée.");
    return view;
  });

export const listSavedViews = defineAction({
  input: z.object({ resource: resourceSchema, organizationId: orgSchema }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireListAccess(context, input.resource, input.organizationId);
    return yield* actionTry("savedViews.list", () => getDrizzle().select({ id: adminSavedViews.id, name: adminSavedViews.name, query: adminSavedViews.query }).from(adminSavedViews)
      .where(and(eq(adminSavedViews.userId, user.id), eq(adminSavedViews.resource, input.resource), tenantOf(input.organizationId))).orderBy(asc(adminSavedViews.name)));
  })),
});

export const createSavedView = defineAction({
  input: z.object({ resource: resourceSchema, organizationId: orgSchema, name: z.string().trim().min(1).max(80), query: z.string().max(4000) }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireListAccess(context, input.resource, input.organizationId);
    yield* actionRateLimit(user.id, "saved-views");
    const query = canonicalListQuery(ADMIN_LISTS[input.resource]!.definition, input.query.replace(/^\?/, ""));
    const db = getDrizzle();
    const scope = and(eq(adminSavedViews.userId, user.id), eq(adminSavedViews.resource, input.resource), tenantOf(input.organizationId));
    const [{ n }] = yield* actionTry("savedViews.count", () => db.select({ n: count() }).from(adminSavedViews).where(scope));
    if (Number(n) >= MAX_SAVED_VIEWS) return yield* fail("BAD_REQUEST", `Maximum ${MAX_SAVED_VIEWS} vues enregistrées par liste.`);
    const [dup] = yield* actionTry("savedViews.dup", () => db.select({ id: adminSavedViews.id }).from(adminSavedViews).where(and(scope, eq(adminSavedViews.name, input.name))).limit(1));
    if (dup) return yield* fail("CONFLICT", "Une vue porte déjà ce nom.");
    const [view] = yield* actionTry("savedViews.create", () => db.insert(adminSavedViews).values({ userId: user.id, organizationId: input.organizationId, resource: input.resource, name: input.name, query }).returning({ id: adminSavedViews.id, name: adminSavedViews.name, query: adminSavedViews.query }));
    return view!;
  })),
});

export const renameSavedView = defineAction({
  input: z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(80) }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireUser(context);
    const view = yield* ownedView(input.id, user.id);
    const [dup] = yield* actionTry("savedViews.dup", () => getDrizzle().select({ id: adminSavedViews.id }).from(adminSavedViews).where(and(eq(adminSavedViews.userId, user.id), eq(adminSavedViews.resource, view.resource), tenantOf(view.organizationId), eq(adminSavedViews.name, input.name))).limit(1));
    if (dup && dup.id !== view.id) return yield* fail("CONFLICT", "Une vue porte déjà ce nom.");
    yield* actionTry("savedViews.rename", () => getDrizzle().update(adminSavedViews).set({ name: input.name }).where(eq(adminSavedViews.id, view.id)));
    return { success: true as const };
  })),
});

export const deleteSavedView = defineAction({
  input: z.object({ id: z.string().min(1) }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireUser(context);
    const view = yield* ownedView(input.id, user.id);
    yield* actionTry("savedViews.delete", () => getDrizzle().delete(adminSavedViews).where(and(eq(adminSavedViews.id, view.id), eq(adminSavedViews.userId, user.id))));
    return { success: true as const };
  })),
});
