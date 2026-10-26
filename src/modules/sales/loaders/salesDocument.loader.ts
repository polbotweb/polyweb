/**
 * Lecture du domaine sales (back-office uniquement : aucun document de vente n'est public).
 *
 * SEUL endroit autorisé à LIRE la base pour ce domaine (les écritures passent par
 * `services/`). Chaque lecture est un Effect (`dbTry` → DbError typé) ; `loadSalesDocument`
 * en est l'adaptateur Promise pour les pages Astro. Lecture bornée au tenant.
 */
import { Effect } from "effect";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { sales, salesDocumentLines, salesPayments, salesReminders } from "../schema";

export type SalesDocumentDetail = typeof sales.$inferSelect & {
  readonly lines: readonly (typeof salesDocumentLines.$inferSelect)[];
  readonly payments: readonly (typeof salesPayments.$inferSelect)[];
  readonly reminders: readonly (typeof salesReminders.$inferSelect)[];
  readonly related: readonly { id: string; kind: string; number: string | null; status: string; grossMinor: number }[];
};

const inTenant = (organizationId: string | null) => (organizationId === null ? isNull(sales.organizationId) : eq(sales.organizationId, organizationId));

export const salesLoader = {
  /** Document complet (lignes, encaissements, relances, documents liés) dans le tenant, ou null. */
  byId: (id: string, organizationId: string | null) =>
    Effect.gen(function* () {
      const db = getDrizzle();
      const [row] = yield* dbTry("sales.byId", () => db.select().from(sales).where(and(eq(sales.id, id), inTenant(organizationId))).limit(1));
      if (!row) return null;
      const [lines, payments, reminders, children] = yield* dbTry("sales.byId.children", () => Promise.all([
        db.select().from(salesDocumentLines).where(eq(salesDocumentLines.documentId, id)).orderBy(asc(salesDocumentLines.position)),
        db.select().from(salesPayments).where(eq(salesPayments.documentId, id)).orderBy(asc(salesPayments.paidAt)),
        db.select().from(salesReminders).where(eq(salesReminders.documentId, id)).orderBy(asc(salesReminders.level)),
        db.select({ id: sales.id, kind: sales.kind, number: sales.number, status: sales.status, grossMinor: sales.grossMinor }).from(sales).where(eq(sales.sourceDocumentId, id)).orderBy(desc(sales.createdAt)),
      ]));
      const source = row.sourceDocumentId
        ? yield* dbTry("sales.byId.source", () => db.select({ id: sales.id, kind: sales.kind, number: sales.number, status: sales.status, grossMinor: sales.grossMinor }).from(sales).where(eq(sales.id, row.sourceDocumentId!)).limit(1))
        : [];
      return { ...row, lines, payments, reminders, related: [...source, ...children] } satisfies SalesDocumentDetail;
    }),
};

/** Adaptateur Promise (pages Astro). */
export const loadSalesDocument = (id: string, organizationId: string | null): Promise<SalesDocumentDetail | null> =>
  runOrThrow(salesLoader.byId(id, organizationId));

/** Organisation propriétaire d'un document (`null` = plateforme), ou null s'il n'existe pas — garde tenant. */
export const salesOrganizationOf = (id: string): Promise<{ organizationId: string | null } | null> =>
  runOrThrow(dbTry("sales.organizationOf", () => getDrizzle().select({ organizationId: sales.organizationId }).from(sales).where(eq(sales.id, id)).limit(1)).pipe(Effect.map(([row]) => row ?? null)));
