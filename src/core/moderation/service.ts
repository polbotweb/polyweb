/**
 * Service de modération générique (docs/moderation.md).
 *
 * - `submitReport` : signalement dédoublonné (un ouvert par signaleur et par cible), réponse
 *   identique pour une cible absente, invisible ou d'un autre tenant (`ModerationUnavailableError`).
 * - `decideModeration` : décision motivée hide/restore/spam ; dans UNE transaction : effet
 *   métier de l'adaptateur, historique, clôture des signalements, audit et outbox.
 * - `resolveModerationReports` : clôture motivée (resolved/dismissed) des signalements d'une cible
 *   sans toucher au statut éditorial.
 * Aucune de ces écritures ne journalise de contenu, d'IP ou l'identité du signaleur.
 */
import { and, count, desc, eq, inArray, isNull, max, min, or, sql, type SQL } from "drizzle-orm";
import { Data, Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { moderationActions, moderationReports, type ModerationReportReason, type ModerationReportStatus } from "@database/schemas/moderation.schema";
import { auditLog } from "@database/schemas/audit-log.schema";
import { stripHtml } from "@/core/content/text";
import { recordEvent } from "@/core/events/outbox";
import { dbTry } from "@/lib/effect/run";
import { afterCommit, dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { getModerationTarget, type ModerationDecisionName, type ModerationOutcome, type ModerationTargetInfo, type RegisteredModerationTarget } from "./registry";

export const MODERATION_DECIDED_EVENT = "moderation.decided";
export const MODERATION_DESCRIPTION_MAX = 1000;
export const MODERATION_NOTE_MAX = 1000;

/** Cible absente, invisible, hors tenant ou inconnue : indiscernables pour l'appelant. */
export class ModerationUnavailableError extends Data.TaggedError("ModerationUnavailableError")<{ readonly message: string }> {}
/** Décision impossible sur ce type de cible (ex. masquer un article : signalement seulement). */
export class ModerationUnsupportedError extends Data.TaggedError("ModerationUnsupportedError")<{ readonly message: string }> {}

const unavailable = () => new ModerationUnavailableError({ message: "Élément introuvable." });

const targetOf = (key: string) => Effect.suspend(() => {
  const target = getModerationTarget(key);
  return target ? Effect.succeed(target) : Effect.fail(unavailable());
});

/** Texte brut borné (le rendu l'échappe toujours ; aucun HTML n'est conservé). */
export function cleanModerationText(value: string | null | undefined, maxLength: number): string | null {
  const text = stripHtml(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
  return text.length > 0 ? text : null;
}

// ─── Signalement ─────────────────────────────────────────────────────────────

export interface SubmitReportInput {
  readonly key: string;
  readonly targetId: string;
  readonly reason: ModerationReportReason;
  readonly description?: string | null;
  readonly reporterId: string | null;
  /** Empreinte `reporterKey()` (jamais l'IP ni l'identifiant en clair). */
  readonly reporterKey: string;
}

/** Toujours `{ accepted: true }` pour une cible signalable, doublon compris (pas d'oracle). */
export const submitReport = (input: SubmitReportInput) =>
  Effect.gen(function* () {
    const target = yield* targetOf(input.key);
    const db = getDrizzle();
    const info = yield* target.load(db, input.targetId);
    if (!info || !info.publiclyVisible) return yield* Effect.fail(unavailable());
    yield* dbTry("moderation.report.insert", () =>
      db
        .insert(moderationReports)
        .values({
          module: target.module,
          targetType: target.type,
          targetId: input.targetId,
          organizationId: info.organizationId,
          reporterId: input.reporterId,
          reporterKey: input.reporterKey,
          reason: input.reason,
          description: cleanModerationText(input.description, MODERATION_DESCRIPTION_MAX),
        })
        .onConflictDoNothing(),
    );
    return { accepted: true as const };
  }).pipe(Effect.withSpan("moderation.report"));

// ─── Portée d'une cible (autorisation) ───────────────────────────────────────

export interface ModerationScope {
  readonly target: RegisteredModerationTarget;
  readonly info: ModerationTargetInfo | null;
  readonly organizationId: string | null;
  readonly siteId: string | null;
}

/**
 * Portée d'autorisation d'une cible : celle du contenu, ou — contenu disparu — celle de ses
 * signalements (seule action possible : les clore). Rien → `ModerationUnavailableError`.
 */
export const moderationScope = (key: string, targetId: string) =>
  Effect.gen(function* () {
    const target = yield* targetOf(key);
    const db = getDrizzle();
    const info = yield* target.load(db, targetId);
    if (info) return { target, info, organizationId: info.organizationId, siteId: info.siteId } satisfies ModerationScope;
    const [report] = yield* dbTry("moderation.scope.reports", () =>
      db
        .select({ organizationId: moderationReports.organizationId })
        .from(moderationReports)
        .where(and(eq(moderationReports.module, target.module), eq(moderationReports.targetType, target.type), eq(moderationReports.targetId, targetId)))
        .limit(1),
    );
    if (!report) return yield* Effect.fail(unavailable());
    return { target, info: null, organizationId: report.organizationId, siteId: null } satisfies ModerationScope;
  });

const sameScope = (a: string | null, b: string | null) => a === b;

const targetReports = (target: RegisteredModerationTarget, targetId: string) =>
  and(eq(moderationReports.module, target.module), eq(moderationReports.targetType, target.type), eq(moderationReports.targetId, targetId));

/** Audit écrit dans `tx` : échoue avec elle (pas de décision sans trace, pas de trace sans décision). */
const auditInTx = (tx: DbTransaction, input: { actorId: string; action: string; target: RegisteredModerationTarget; targetId: string; organizationId: string | null; siteId: string | null; metadata: Record<string, unknown> }) =>
  dbTry("moderation.audit", () =>
    tx.insert(auditLog).values({
      userId: input.actorId,
      action: `moderation.${input.target.module}.${input.action}`,
      resource: input.target.key,
      resourceId: input.targetId,
      organizationId: input.organizationId,
      siteId: input.siteId,
      module: input.target.module,
      outcome: "success",
      metadata: input.metadata,
    }),
  );

// ─── Décision ────────────────────────────────────────────────────────────────

export interface DecideInput {
  readonly key: string;
  readonly targetId: string;
  readonly decision: ModerationDecisionName;
  readonly actorId: string;
  /** Organisation autorisée par l'appelant : revérifiée sous verrou dans la transaction. */
  readonly organizationId: string | null;
  readonly reasonCode?: string | null;
  readonly note: string;
}

export interface DecideResult {
  readonly changed: boolean;
  readonly status: string;
  readonly resolvedReports: number;
  readonly actionId: string | null;
}

export const decideModeration = (input: DecideInput) =>
  Effect.gen(function* () {
    const target = yield* targetOf(input.key);
    const apply = target.apply;
    if (!apply) return yield* Effect.fail(new ModerationUnsupportedError({ message: "Cette cible n'accepte que le traitement des signalements." }));
    const result = yield* dbTransaction("moderation.decide", (tx) =>
      Effect.gen(function* () {
        const info = yield* target.load(tx, input.targetId);
        if (!info || !sameScope(info.organizationId, input.organizationId)) return yield* Effect.fail(unavailable());
        const next = yield* apply(tx, input.targetId, input.decision, info);
        if (next === null || next === info.status) return { changed: false, status: info.status, resolvedReports: 0, actionId: null } satisfies DecideResult;
        const note = cleanModerationText(input.note, MODERATION_NOTE_MAX);
        const [action] = yield* dbTry("moderation.decide.history", () =>
          tx
            .insert(moderationActions)
            .values({
              module: target.module,
              targetType: target.type,
              targetId: input.targetId,
              organizationId: info.organizationId,
              actorId: input.actorId,
              action: input.decision,
              reasonCode: input.reasonCode ?? null,
              note,
              fromStatus: info.status,
              toStatus: next,
            })
            .returning({ id: moderationActions.id }),
        );
        const resolved = input.decision === "restore"
          ? []
          : yield* dbTry("moderation.decide.reports", () =>
              tx
                .update(moderationReports)
                .set({ status: "resolved", resolvedBy: input.actorId, resolvedAt: new Date() })
                .where(and(targetReports(target, input.targetId), eq(moderationReports.status, "open")))
                .returning({ id: moderationReports.id }),
            );
        yield* auditInTx(tx, {
          actorId: input.actorId,
          action: input.decision,
          target,
          targetId: input.targetId,
          organizationId: info.organizationId,
          siteId: info.siteId,
          metadata: { actionId: action.id, from: info.status, to: next, reasonCode: input.reasonCode ?? null, resolvedReports: resolved.length },
        });
        // Charge utile publique (webhooks, plugins) : identifiants et décision seulement.
        yield* recordEvent(tx, MODERATION_DECIDED_EVENT, { actionId: action.id, module: target.module, targetType: target.type, targetId: input.targetId, decision: input.decision }, { organizationId: info.organizationId });
        if (target.afterCommit) yield* afterCommit(tx, Effect.sync(target.afterCommit));
        return { changed: true, status: next, resolvedReports: resolved.length, actionId: action.id } satisfies DecideResult;
      }),
    );
    return result;
  }).pipe(Effect.withSpan("moderation.decide", { attributes: { "moderation.decision": input.decision } }));

// ─── Clôture des signalements ────────────────────────────────────────────────

export interface ResolveInput {
  readonly key: string;
  readonly targetId: string;
  readonly outcome: ModerationOutcome;
  readonly actorId: string;
  readonly organizationId: string | null;
  readonly siteId: string | null;
  readonly note: string;
  /** Limite la clôture à un signalement (façades historiques). */
  readonly reportId?: string;
}

export const resolveModerationReports = (input: ResolveInput) =>
  Effect.gen(function* () {
    const target = yield* targetOf(input.key);
    return yield* dbTransaction("moderation.resolve", (tx) =>
      Effect.gen(function* () {
        const scope = input.organizationId === null ? isNull(moderationReports.organizationId) : eq(moderationReports.organizationId, input.organizationId);
        const conditions: SQL[] = [targetReports(target, input.targetId) as SQL, eq(moderationReports.status, "open"), scope];
        if (input.reportId) conditions.push(eq(moderationReports.id, input.reportId));
        const closed = yield* dbTry("moderation.resolve.reports", () =>
          tx
            .update(moderationReports)
            .set({ status: input.outcome, resolvedBy: input.actorId, resolvedAt: new Date() })
            .where(and(...conditions))
            .returning({ id: moderationReports.id }),
        );
        if (closed.length === 0) return { changed: false, closedReports: 0, actionId: null };
        const [action] = yield* dbTry("moderation.resolve.history", () =>
          tx
            .insert(moderationActions)
            .values({
              module: target.module,
              targetType: target.type,
              targetId: input.targetId,
              organizationId: input.organizationId,
              actorId: input.actorId,
              action: input.outcome === "resolved" ? "resolve" : "dismiss",
              note: cleanModerationText(input.note, MODERATION_NOTE_MAX),
            })
            .returning({ id: moderationActions.id }),
        );
        yield* auditInTx(tx, {
          actorId: input.actorId,
          action: input.outcome === "resolved" ? "resolve" : "dismiss",
          target,
          targetId: input.targetId,
          organizationId: input.organizationId,
          siteId: input.siteId,
          metadata: { actionId: action.id, closedReports: closed.length },
        });
        return { changed: true, closedReports: closed.length, actionId: action.id };
      }),
    );
  }).pipe(Effect.withSpan("moderation.resolve"));

// ─── File groupée ────────────────────────────────────────────────────────────

export interface ModerationQueueInput {
  readonly organizationId: string | null;
  /** Clés `module.type` que l'utilisateur peut modérer dans cette portée. */
  readonly keys: readonly string[];
  readonly status: ModerationReportStatus;
  readonly page: number;
  readonly pageSize: number;
  readonly locale: string;
}

export interface ModerationQueueItem {
  readonly key: string;
  readonly module: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly reports: number;
  readonly reasons: readonly string[];
  readonly firstReportedAt: Date;
  readonly lastReportedAt: Date;
  /** `null` : contenu disparu (signalements à clore seulement). */
  readonly status: string | null;
  readonly excerpt: { readonly title: string | null; readonly text: string; readonly url: string | null } | null;
  readonly decidable: boolean;
  readonly lastAction: { readonly action: string; readonly note: string | null; readonly createdAt: Date } | null;
}

/** File groupée par cible ; extraits chargés par l'adaptateur (appelant déjà autorisé). */
export const listModerationQueue = (input: ModerationQueueInput) =>
  Effect.gen(function* () {
    const targets = input.keys.map(getModerationTarget).filter((t): t is RegisteredModerationTarget => t !== undefined);
    if (targets.length === 0) return { items: [] as ModerationQueueItem[], total: 0 };
    const db = getDrizzle();
    const byType = or(...targets.map((t) => and(eq(moderationReports.module, t.module), eq(moderationReports.targetType, t.type))));
    const where = and(
      input.organizationId === null ? isNull(moderationReports.organizationId) : eq(moderationReports.organizationId, input.organizationId),
      eq(moderationReports.status, input.status),
      byType,
    );
    const lastAt = max(moderationReports.createdAt);
    const [rows, [totalRow]] = yield* Effect.all([
      dbTry("moderation.queue.rows", () =>
        db
          .select({
            module: moderationReports.module,
            targetType: moderationReports.targetType,
            targetId: moderationReports.targetId,
            reports: count(),
            reasons: sql<string[]>`array_agg(distinct ${moderationReports.reason} order by ${moderationReports.reason})`,
            firstReportedAt: min(moderationReports.createdAt),
            lastReportedAt: lastAt,
          })
          .from(moderationReports)
          .where(where)
          .groupBy(moderationReports.module, moderationReports.targetType, moderationReports.targetId)
          .orderBy(desc(lastAt), moderationReports.targetId)
          .limit(input.pageSize)
          .offset((Math.max(1, input.page) - 1) * input.pageSize),
      ),
      dbTry("moderation.queue.total", () =>
        db
          .select({ total: sql<number>`count(distinct (${moderationReports.module}, ${moderationReports.targetType}, ${moderationReports.targetId}))::int` })
          .from(moderationReports)
          .where(where),
      ),
    ]);
    const ids = rows.map((r) => r.targetId);
    const history = ids.length === 0 ? [] : yield* dbTry("moderation.queue.history", () =>
      db
        .select({ module: moderationActions.module, targetType: moderationActions.targetType, targetId: moderationActions.targetId, action: moderationActions.action, note: moderationActions.note, createdAt: moderationActions.createdAt })
        .from(moderationActions)
        .where(inArray(moderationActions.targetId, ids))
        .orderBy(desc(moderationActions.createdAt)),
    );
    const items = yield* Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        const key = `${row.module}.${row.targetType}`;
        const target = targets.find((t) => t.key === key);
        const info = target ? yield* target.load(db, row.targetId) : null;
        const excerpt = target && info ? yield* target.excerpt(db, row.targetId, input.locale) : null;
        const last = history.find((h) => h.module === row.module && h.targetType === row.targetType && h.targetId === row.targetId);
        return {
          key,
          module: row.module,
          targetType: row.targetType,
          targetId: row.targetId,
          reports: Number(row.reports),
          reasons: row.reasons ?? [],
          firstReportedAt: row.firstReportedAt ?? new Date(0),
          lastReportedAt: row.lastReportedAt ?? new Date(0),
          status: info?.status ?? null,
          excerpt,
          decidable: Boolean(target?.apply && info),
          lastAction: last ? { action: last.action, note: last.note, createdAt: last.createdAt } : null,
        } satisfies ModerationQueueItem;
      }),
    );
    return { items, total: Number(totalRow?.total ?? 0) };
  }).pipe(Effect.withSpan("moderation.queue"));

/** Nombre de cibles ayant des signalements ouverts (badges des façades historiques). */
export const countOpenModerationTargets = (organizationId: string | null, keys: readonly string[]) =>
  listModerationQueue({ organizationId, keys, status: "open", page: 1, pageSize: 1, locale: "fr" }).pipe(Effect.map((q) => q.total));
