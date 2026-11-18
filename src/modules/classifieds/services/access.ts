/**
 * Accès au tableau et aux annonces : permissions, visibilité, débit, NOT_FOUND indiscernable.
 */
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { sites } from "@database/schemas/content.schema";
import { fail } from "@/lib/effect/failure";
import { dbTry } from "@/lib/effect/run";
import { isGlobalAdmin, organizationRoleOf, tenantPermission, type TenantActor } from "@/core/permissions/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { classifiedAds, classifiedSiteSettings } from "../schema";
import { canViewAd, canViewBoard, CLASSIFIED_RATE_LIMITS, NOT_FOUND_MESSAGE, type ClassifiedRateLimitKind } from "../domain/rules";
import type { ClassifiedVisibility } from "../domain/workflow";

export type ClassifiedsAction = "read" | "create" | "update" | "delete" | "moderate" | "configure";
export type ClassifiedViewer = (TenantActor & { banned?: boolean | null }) | null;
export type Scope = { organizationId: string | null; siteId: string };

export const notFound = () => fail("NOT_FOUND", NOT_FOUND_MESSAGE);

export const classifiedsCan = (viewer: ClassifiedViewer, scope: { organizationId: string | null; siteId: string | null }, actions: readonly ClassifiedsAction[]) =>
  Effect.gen(function* () {
    if (!viewer || viewer.banned) return false;
    if (isGlobalAdmin(viewer)) return true;
    if (scope.organizationId === null) {
      return yield* Effect.tryPromise(() =>
        import("@/lib/auth").then((m) => m.auth.api.userHasPermission({ body: { userId: viewer.id, permissions: { classifieds: [...actions] } } })),
      ).pipe(Effect.map((r) => r.success === true), Effect.catch(() => Effect.succeed(false)));
    }
    const decision = yield* tenantPermission(viewer, scope.organizationId, { classifieds: [...actions] }, scope.siteId);
    return decision.allowed;
  }).pipe(Effect.catch(() => Effect.succeed(false)));

export const isOrgMember = (viewer: ClassifiedViewer, organizationId: string | null) =>
  !viewer || !organizationId ? Effect.succeed(false) : organizationRoleOf(viewer.id, organizationId).pipe(Effect.map((role) => role !== null));

export const siteScope = (siteId: string) =>
  dbTry("classifieds.access.site", () => getDrizzle().select({ id: sites.id, organizationId: sites.organizationId }).from(sites).where(eq(sites.id, siteId)).limit(1)).pipe(
    Effect.flatMap((rows) => (rows[0] ? Effect.succeed({ siteId: rows[0].id, organizationId: rows[0].organizationId ?? null }) : notFound())),
  );

export const loadSettings = (siteId: string) =>
  dbTry("classifieds.settings.load", () => getDrizzle().select().from(classifiedSiteSettings).where(eq(classifiedSiteSettings.siteId, siteId)).limit(1)).pipe(
    Effect.map((rows) => rows[0] ?? { siteId, visibility: "public" as ClassifiedVisibility, preModeration: true, durationDays: 30, defaultCurrency: "EUR", maxImages: 8, maxRenewals: 3, updatedBy: null, updatedAt: new Date() }),
  );

export const boardAccess = (siteId: string, viewer: ClassifiedViewer) =>
  Effect.gen(function* () {
    const scope = yield* siteScope(siteId);
    const settings = yield* loadSettings(siteId);
    const manager = yield* classifiedsCan(viewer, scope, ["moderate"]);
    const orgMember = yield* isOrgMember(viewer, scope.organizationId);
    const visible = canViewBoard({ visibility: settings.visibility, signedIn: Boolean(viewer && !viewer.banned), orgMember, manager });
    if (!visible) return yield* notFound();
    return { ...scope, settings, manager, orgMember, visible };
  });

export const adAccess = (adId: string, viewer: ClassifiedViewer) =>
  Effect.gen(function* () {
    const [ad] = yield* dbTry("classifieds.access.ad", () => getDrizzle().select().from(classifiedAds).where(eq(classifiedAds.id, adId)).limit(1));
    if (!ad) return yield* notFound();
    const board = yield* boardAccess(ad.siteId, viewer).pipe(Effect.catchTag("ActionFailure", () => notFound()));
    const isAuthor = Boolean(viewer && ad.authorId === viewer.id);
    if (!canViewAd({ boardVisible: board.visible, lifecycle: ad.lifecycle, moderationStatus: ad.moderationStatus, isAuthor, manager: board.manager })) {
      return yield* notFound();
    }
    return { ...board, ad, isAuthor };
  });

export const requireUser = (viewer: ClassifiedViewer) =>
  Effect.gen(function* () {
    if (!viewer) return yield* fail("UNAUTHORIZED", "Vous devez être connecté pour effectuer cette action.");
    if (viewer.banned) return yield* fail("FORBIDDEN", "Compte suspendu.");
    return viewer;
  });

export const classifiedRateLimit = (userId: string, kind: ClassifiedRateLimitKind, extra = "") =>
  Effect.suspend(() =>
    checkRateLimit(`classifieds-${kind}:${userId}${extra ? `:${extra}` : ""}`, CLASSIFIED_RATE_LIMITS[kind]).allowed
      ? Effect.void
      : fail("TOO_MANY_REQUESTS", "Trop de requêtes. Veuillez réessayer dans quelques instants."),
  );
