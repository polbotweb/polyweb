/**
 * Cible de modération `classifieds.ad` : hide / restore / spam sur `moderation_status`,
 * distinct du cycle de vie métier. Un refus de signalement est indiscernable d'une cible absente.
 */
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { stripHtml } from "@/core/content/text";
import { dbTry } from "@/lib/effect/run";
import { defineModuleModeration, type ModerationTargetAdapter } from "@/core/moderation/registry";
import { classifiedAds } from "../schema";
import { adModerationTransition, canViewBoard, isPubliclyListed } from "../domain/rules";
import { loadSettings } from "../services/access";
import { organizationRoleOf } from "@/core/permissions/tenant";
import type { ModerationStatus } from "../domain/workflow";

const EXCERPT = 280;
const clip = (text: string) => stripHtml(text).replace(/\s+/g, " ").trim().slice(0, EXCERPT);

type AdRow = typeof classifiedAds.$inferSelect;

const adRow = (executor: Parameters<ModerationTargetAdapter["load"]>[0], id: string) =>
  dbTry("moderation.classifieds.ad.load", () => executor.select().from(classifiedAds).where(eq(classifiedAds.id, id)).limit(1)).pipe(
    Effect.map((rows) => (rows[0] as AdRow | undefined) ?? null),
  );

const reporterSees = (ad: AdRow, reporterId: string | null) =>
  Effect.gen(function* () {
    if (!isPubliclyListed(ad.lifecycle, ad.moderationStatus)) return false;
    const settings = yield* loadSettings(ad.siteId);
    const orgMember = reporterId && ad.organizationId ? (yield* organizationRoleOf(reporterId, ad.organizationId)) !== null : false;
    return canViewBoard({ visibility: settings.visibility, signedIn: reporterId !== null, orgMember, manager: false });
  });

const ad: ModerationTargetAdapter = {
  type: "ad",
  permission: { classifieds: ["moderate"] },
  reporters: "authenticated",
  load: (executor, id) => adRow(executor, id).pipe(Effect.map((row) => row && {
    organizationId: row.organizationId, siteId: row.siteId, authorId: row.authorId, status: row.moderationStatus,
    publiclyVisible: isPubliclyListed(row.lifecycle, row.moderationStatus),
  })),
  canReport: (executor, id, reporterId) => adRow(executor, id).pipe(Effect.flatMap((row) => (row ? reporterSees(row, reporterId) : Effect.succeed(false)))),
  excerpt: (executor, id) => adRow(executor, id).pipe(Effect.map((row) => row && { title: row.title, text: clip(row.body), url: null })),
  apply: (tx, id, decision, current) =>
    Effect.gen(function* () {
      const next = adModerationTransition(current.status as ModerationStatus, decision);
      if (!next) return null;
      const updated = yield* dbTry("moderation.classifieds.ad.apply", () =>
        tx.update(classifiedAds).set({ moderationStatus: next, moderatedAt: new Date() }).where(and(eq(classifiedAds.id, id), eq(classifiedAds.moderationStatus, current.status as ModerationStatus))).returning({ id: classifiedAds.id }),
      );
      return updated[0] ? next : null;
    }),
};

export const classifiedsModeration = defineModuleModeration("classifieds", [ad]);
