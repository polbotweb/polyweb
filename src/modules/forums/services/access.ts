/**
 * Accès aux forums : lecteur, forum, sujet. Tout refus de lecture (forum privé à
 * l'organisation, fil privé, contenu masqué, identifiant inconnu) produit la MÊME erreur
 * `NOT_FOUND` (pas d'oracle d'existence). Les gestionnaires (modération) sont évalués dans la
 * portée du forum : organisation + site (core/permissions/tenant), plateforme = RBAC global.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { sites } from "@database/schemas/content.schema";
import { forumSanctions, forumTopicParticipants, forumTopics, forums, type ForumContentStatus, type ForumVisibility } from "../schema";
import { dbTry } from "@/lib/effect/run";
import { fail } from "@/lib/effect/failure";
import { checkRateLimit } from "@/lib/rate-limit";
import { isGlobalAdmin, organizationRoleOf, tenantPermission, type TenantActor } from "@/core/permissions/tenant";
import type { ModerationExecutor } from "@/core/moderation/registry";
import { canViewForum, canViewTopic, FORUM_RATE_LIMITS, NOT_FOUND_MESSAGE, sanctionBlocks, type ForumRateLimitKind } from "../domain/rules";

export type ForumViewer = (TenantActor & { readonly id: string; readonly name?: string | null }) | null;
export type ForumsAction = "read" | "create" | "update" | "publish" | "delete" | "moderate" | "configure";

export const notFound = () => fail("NOT_FOUND", NOT_FOUND_MESSAGE);

export interface ForumRow {
  readonly id: string;
  readonly siteId: string;
  readonly organizationId: string | null;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly visibility: ForumVisibility;
  readonly status: string;
}

const forumColumns = {
  id: forums.id, siteId: forums.siteId, organizationId: forums.organizationId, slug: forums.slug, title: forums.title,
  description: forums.description, visibility: forums.visibility, status: forums.status,
};

/** Permission forums dans la portée (org, site) ; plateforme : RBAC global. Jamais d'échec : refus = false. */
export const forumsCan = (viewer: ForumViewer, scope: { organizationId: string | null; siteId: string | null }, actions: readonly ForumsAction[]) =>
  Effect.gen(function* () {
    if (!viewer || viewer.banned) return false;
    if (isGlobalAdmin(viewer)) return true;
    if (scope.organizationId === null) {
      return yield* Effect.tryPromise(() =>
        import("@/lib/auth").then((m) => m.auth.api.userHasPermission({ body: { userId: viewer.id, permissions: { forums: [...actions] } } })),
      ).pipe(Effect.map((r) => r.success === true), Effect.catch(() => Effect.succeed(false)));
    }
    const decision = yield* tenantPermission(viewer, scope.organizationId, { forums: [...actions] }, scope.siteId);
    return decision.allowed;
  }).pipe(Effect.catch(() => Effect.succeed(false)));

export const isOrgMember = (viewer: ForumViewer, organizationId: string | null) =>
  !viewer || organizationId === null ? Effect.succeed(false) : organizationRoleOf(viewer.id, organizationId).pipe(Effect.map((role) => role !== null));

export interface ForumAccess {
  readonly forum: ForumRow;
  readonly manager: boolean;
}

const forumAccess = (forum: ForumRow | undefined, viewer: ForumViewer) =>
  Effect.gen(function* () {
    if (!forum) return yield* notFound();
    const manager = yield* forumsCan(viewer, forum, ["moderate"]);
    const orgMember = forum.visibility === "org" && !manager ? yield* isOrgMember(viewer, forum.organizationId) : false;
    const visible = canViewForum({ status: forum.status, visibility: forum.visibility, organizationId: forum.organizationId, signedIn: Boolean(viewer && !viewer.banned), orgMember, manager });
    if (!visible) return yield* notFound();
    return { forum, manager } satisfies ForumAccess;
  });

export const forumBySlug = (siteId: string, slug: string, viewer: ForumViewer) =>
  dbTry("forums.access.bySlug", () => getDrizzle().select(forumColumns).from(forums).where(and(eq(forums.siteId, siteId), eq(forums.slug, slug))).limit(1)).pipe(
    Effect.flatMap((rows) => forumAccess(rows[0] as ForumRow | undefined, viewer)),
  );

export const forumById = (id: string, viewer: ForumViewer) =>
  dbTry("forums.access.byId", () => getDrizzle().select(forumColumns).from(forums).where(eq(forums.id, id)).limit(1)).pipe(
    Effect.flatMap((rows) => forumAccess(rows[0] as ForumRow | undefined, viewer)),
  );

export interface TopicAccess extends ForumAccess {
  readonly topic: typeof forumTopics.$inferSelect;
  readonly participant: boolean;
}

export const isParticipant = (executor: ModerationExecutor, topicId: string, userId: string | null | undefined) =>
  !userId
    ? Effect.succeed(false)
    : dbTry("forums.access.participant", () =>
        executor.select({ userId: forumTopicParticipants.userId }).from(forumTopicParticipants)
          .where(and(eq(forumTopicParticipants.topicId, topicId), eq(forumTopicParticipants.userId, userId))).limit(1),
      ).pipe(Effect.map((rows) => rows.length > 0));

/** Sujet visible par ce lecteur (sinon NOT_FOUND indiscernable). */
export const topicAccess = (topicId: string, viewer: ForumViewer) =>
  Effect.gen(function* () {
    const [topic] = yield* dbTry("forums.access.topic", () => getDrizzle().select().from(forumTopics).where(eq(forumTopics.id, topicId)).limit(1));
    if (!topic) return yield* notFound();
    const access = yield* forumById(topic.forumId, viewer);
    const participant = topic.isPrivate ? yield* isParticipant(getDrizzle(), topic.id, viewer?.id) : false;
    if (!canViewTopic({ forumVisible: true, status: topic.status as ForumContentStatus, isPrivate: topic.isPrivate, participant, manager: access.manager })) return yield* notFound();
    return { ...access, topic, participant } satisfies TopicAccess;
  });

/** Sanctions actives (non levées, non échues) d'un utilisateur sur un site. */
export const activeSanctions = (executor: ModerationExecutor, siteId: string, userId: string, now = new Date()) =>
  dbTry("forums.sanctions.active", () =>
    executor.select({ id: forumSanctions.id, kind: forumSanctions.kind, endsAt: forumSanctions.endsAt }).from(forumSanctions)
      .where(and(eq(forumSanctions.siteId, siteId), eq(forumSanctions.userId, userId), isNull(forumSanctions.revokedAt), gt(forumSanctions.endsAt, now))),
  );

/** Participant connecté, non banni, sans sanction bloquante pour cette activité. */
export const requireParticipant = (viewer: ForumViewer, siteId: string, activity: "post" | "interact") =>
  Effect.gen(function* () {
    if (!viewer) return yield* fail("UNAUTHORIZED", "Vous devez être connecté pour effectuer cette action.");
    if (viewer.banned) return yield* fail("FORBIDDEN", "Compte suspendu.");
    const sanctions = yield* activeSanctions(getDrizzle(), siteId, viewer.id);
    if (sanctionBlocks(sanctions.map((s) => s.kind), activity)) {
      const until = sanctions.reduce((max, s) => (s.endsAt > max ? s.endsAt : max), new Date(0));
      return yield* fail("FORBIDDEN", `Participation restreinte jusqu'au ${until.toISOString()} (sanction de modération).`);
    }
    return viewer;
  });

/** Limite de débit par utilisateur et par type d'écriture. */
export const forumRateLimit = (userId: string, kind: ForumRateLimitKind) =>
  Effect.suspend(() =>
    checkRateLimit(`forums-${kind}:${userId}`, FORUM_RATE_LIMITS[kind]).allowed ? Effect.void : fail("TOO_MANY_REQUESTS", "Trop de requêtes. Veuillez réessayer dans quelques instants."),
  );

/** Portée d'administration d'un site : son organisation (null = plateforme). Inconnu → NOT_FOUND. */
export const siteScope = (siteId: string) =>
  dbTry("forums.access.site", () => getDrizzle().select({ id: sites.id, organizationId: sites.organizationId }).from(sites).where(eq(sites.id, siteId)).limit(1)).pipe(
    Effect.flatMap(([row]) => (row ? Effect.succeed({ siteId: row.id, organizationId: row.organizationId }) : notFound())),
  );
