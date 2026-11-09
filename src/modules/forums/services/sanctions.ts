/**
 * Sanctions automatiques des forums (politique par site) :
 * - évaluées dans la transaction d'une décision de modération retenue (masquage / spam) ;
 * - toujours auditées (acteur nul = automatique) et notifiées à la personne sanctionnée via
 *   l'outbox (charge utile : identifiants, type, échéance ; JAMAIS de signalement ni de signaleur) ;
 * - levées par un modérateur, avec motif obligatoire (audit + notification).
 */
import { and, desc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { user } from "@database/schemas/auth.schema";
import { recordEvent } from "@/core/events/outbox";
import { dbTry } from "@/lib/effect/run";
import { fail } from "@/lib/effect/failure";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { cleanModerationText } from "@/core/moderation/service";
import { forumSanctionPolicies, forumSanctions } from "../schema";
import { FORUMS_SANCTION_APPLIED_EVENT, FORUMS_SANCTION_REVOKED_EVENT } from "../domain/events";
import { autoSanctionDecision, DEFAULT_SANCTION_POLICY, NOTE_MAX, NOT_FOUND_MESSAGE, sanctionEnd, validSanctionPolicy, type SanctionPolicy } from "../domain/rules";
import { forumsAudit } from "./audit";
import type { ModerationExecutor } from "@/core/moderation/registry";

export const sanctionPolicy = (executor: ModerationExecutor, siteId: string) =>
  dbTry("forums.sanctions.policy", () => executor.select().from(forumSanctionPolicies).where(eq(forumSanctionPolicies.siteId, siteId)).limit(1)).pipe(
    Effect.map(([row]): SanctionPolicy => (row ? { enabled: row.enabled, windowDays: row.windowDays, muteThreshold: row.muteThreshold, muteHours: row.muteHours, suspendThreshold: row.suspendThreshold, suspendDays: row.suspendDays } : DEFAULT_SANCTION_POLICY)),
  );

export const setSanctionPolicy = (input: { siteId: string; organizationId: string | null; actorId: string; policy: SanctionPolicy }) =>
  Effect.gen(function* () {
    if (!validSanctionPolicy(input.policy)) return yield* fail("BAD_REQUEST", "Seuils invalides : la suspension doit suivre la mise en sourdine, valeurs bornées.");
    return yield* dbTransaction("forums.sanctions.policy.set", (tx) =>
      Effect.gen(function* () {
        const before = yield* sanctionPolicy(tx, input.siteId);
        yield* dbTry("forums.sanctions.policy.upsert", () =>
          tx.insert(forumSanctionPolicies).values({ siteId: input.siteId, ...input.policy, updatedBy: input.actorId, updatedAt: new Date() })
            .onConflictDoUpdate({ target: forumSanctionPolicies.siteId, set: { ...input.policy, updatedBy: input.actorId, updatedAt: new Date() } }),
        );
        yield* forumsAudit(tx, { actorId: input.actorId, action: "forums.sanction_policy.update", resource: "forums.sanction_policy", resourceId: input.siteId, organizationId: input.organizationId, siteId: input.siteId, metadata: { before, after: input.policy } });
        return input.policy;
      }),
    );
  });

/** Contenus de l'auteur masqués (signalements retenus) dans la fenêtre, sur ce site. */
const upheldCount = (tx: DbTransaction, siteId: string, userId: string, since: Date) =>
  dbTry("forums.sanctions.upheld", () =>
    tx.execute(sql`
      select ((select count(*) from forum_topics where site_id = ${siteId} and author_id = ${userId} and status in ('hidden', 'spam') and moderated_at >= ${since})
            + (select count(*) from forum_posts where site_id = ${siteId} and author_id = ${userId} and status in ('hidden', 'spam') and moderated_at >= ${since}))::int as n`),
  ).pipe(Effect.map((r) => Number((r as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0)));

/** Évalue et applique la sanction automatique éventuelle (dans la transaction de la décision). */
export const evaluateAutoSanction = (tx: DbTransaction, input: { siteId: string; organizationId: string | null; userId: string | null }) =>
  Effect.gen(function* () {
    if (!input.userId) return null;
    const policy = yield* sanctionPolicy(tx, input.siteId);
    if (!policy.enabled) return null;
    const now = new Date();
    const since = new Date(now.getTime() - policy.windowDays * 86_400_000);
    // Verrou consultatif par (site, utilisateur) : deux décisions concurrentes n'empilent pas de sanction.
    yield* dbTry("forums.sanctions.lock", () => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`forums-sanction:${input.siteId}:${input.userId}`}))`));
    const upheld = yield* upheldCount(tx, input.siteId, input.userId, since);
    const recent = yield* dbTry("forums.sanctions.recent", () =>
      tx.select({ kind: forumSanctions.kind, endsAt: forumSanctions.endsAt }).from(forumSanctions)
        .where(and(eq(forumSanctions.siteId, input.siteId), eq(forumSanctions.userId, input.userId!), isNull(forumSanctions.revokedAt), gte(forumSanctions.createdAt, since))),
    );
    const active = yield* dbTry("forums.sanctions.active", () =>
      tx.select({ kind: forumSanctions.kind }).from(forumSanctions)
        .where(and(eq(forumSanctions.siteId, input.siteId), eq(forumSanctions.userId, input.userId!), isNull(forumSanctions.revokedAt), gt(forumSanctions.endsAt, now))),
    );
    const kind = autoSanctionDecision({
      policy, upheld, activeKinds: active.map((a) => a.kind),
      priorMuteInWindow: recent.some((r) => r.kind === "mute" && r.endsAt <= now),
    });
    if (!kind) return null;
    const endsAt = sanctionEnd(kind, policy, now);
    const [created] = yield* dbTry("forums.sanctions.insert", () =>
      tx.insert(forumSanctions).values({ siteId: input.siteId, organizationId: input.organizationId, userId: input.userId!, kind, automatic: true, triggerCount: upheld, startsAt: now, endsAt })
        .returning({ id: forumSanctions.id }),
    );
    yield* forumsAudit(tx, { actorId: null, action: "forums.sanction.apply", resource: "forums.sanction", resourceId: created.id, organizationId: input.organizationId, siteId: input.siteId, metadata: { kind, automatic: true, upheld, windowDays: policy.windowDays, endsAt: endsAt.toISOString(), userId: input.userId } });
    yield* recordEvent(tx, FORUMS_SANCTION_APPLIED_EVENT, { sanctionId: created.id, siteId: input.siteId, userId: input.userId, kind, endsAt: endsAt.toISOString() }, { organizationId: input.organizationId });
    return { id: created.id, kind, endsAt };
  });

export interface SanctionListItem {
  readonly id: string; readonly userId: string; readonly userName: string | null; readonly kind: "mute" | "suspension";
  readonly automatic: boolean; readonly triggerCount: number; readonly startsAt: Date; readonly endsAt: Date;
  readonly revokedAt: Date | null; readonly revokeNote: string | null; readonly active: boolean;
}

export const listSanctions = (siteId: string, limit = 100) =>
  dbTry("forums.sanctions.list", () =>
    getDrizzle().select({
      id: forumSanctions.id, userId: forumSanctions.userId, userName: user.name, kind: forumSanctions.kind, automatic: forumSanctions.automatic,
      triggerCount: forumSanctions.triggerCount, startsAt: forumSanctions.startsAt, endsAt: forumSanctions.endsAt, revokedAt: forumSanctions.revokedAt, revokeNote: forumSanctions.revokeNote,
    }).from(forumSanctions).innerJoin(user, eq(user.id, forumSanctions.userId)).where(eq(forumSanctions.siteId, siteId)).orderBy(desc(forumSanctions.createdAt)).limit(limit),
  ).pipe(Effect.map((rows): SanctionListItem[] => { const now = Date.now(); return rows.map((r) => ({ ...r, active: !r.revokedAt && r.endsAt.getTime() > now })); }));

/** Levée motivée d'une sanction active de CE site (sinon NOT_FOUND). */
export const revokeSanction = (input: { sanctionId: string; siteId: string; organizationId: string | null; actorId: string; note: string }) =>
  Effect.gen(function* () {
    const note = cleanModerationText(input.note, NOTE_MAX);
    if (!note || note.length < 3) return yield* fail("BAD_REQUEST", "Motif obligatoire (3 caractères minimum).");
    return yield* dbTransaction("forums.sanctions.revoke", (tx) =>
      Effect.gen(function* () {
        const now = new Date();
        const [row] = yield* dbTry("forums.sanctions.revoke.update", () =>
          tx.update(forumSanctions).set({ revokedAt: now, revokedBy: input.actorId, revokeNote: note })
            .where(and(eq(forumSanctions.id, input.sanctionId), eq(forumSanctions.siteId, input.siteId), isNull(forumSanctions.revokedAt), gt(forumSanctions.endsAt, now)))
            .returning({ id: forumSanctions.id, userId: forumSanctions.userId, kind: forumSanctions.kind }),
        );
        if (!row) return yield* fail("NOT_FOUND", NOT_FOUND_MESSAGE);
        yield* forumsAudit(tx, { actorId: input.actorId, action: "forums.sanction.revoke", resource: "forums.sanction", resourceId: row.id, organizationId: input.organizationId, siteId: input.siteId, metadata: { kind: row.kind, userId: row.userId, note } });
        yield* recordEvent(tx, FORUMS_SANCTION_REVOKED_EVENT, { sanctionId: row.id, siteId: input.siteId, userId: row.userId, kind: row.kind }, { organizationId: input.organizationId });
        return { revoked: true as const };
      }),
    );
  });

/** Sanctions actives de plusieurs utilisateurs (affichage). */
export const activeSanctionsFor = (siteId: string, userIds: readonly string[]) =>
  userIds.length === 0 ? Effect.succeed([]) : dbTry("forums.sanctions.activeFor", () =>
    getDrizzle().select({ userId: forumSanctions.userId, kind: forumSanctions.kind }).from(forumSanctions)
      .where(and(eq(forumSanctions.siteId, siteId), inArray(forumSanctions.userId, [...userIds]), isNull(forumSanctions.revokedAt), gt(forumSanctions.endsAt, new Date()))),
  );
