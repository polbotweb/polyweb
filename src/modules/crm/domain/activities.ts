/**
 * Activités CRM (notes, appels, e-mails, rendez-vous, tâches) : une activité vise au moins une
 * cible (opportunité, contact ou société) ; seules les tâches et rendez-vous ont une échéance.
 */
import { Effect } from "effect";
import { InvalidActivityError } from "./errors";

export const ACTIVITY_KINDS = ["note", "call", "email", "meeting", "task"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const SCHEDULED_KINDS: readonly ActivityKind[] = ["meeting", "task"];

export interface ActivityInput {
  readonly kind: string;
  readonly subject: string;
  readonly dueAt: Date | null;
  readonly opportunityId: string | null;
  readonly contactId: string | null;
  readonly companyId: string | null;
}

export const validateActivity = (input: ActivityInput) =>
  Effect.gen(function* () {
    if (!(ACTIVITY_KINDS as readonly string[]).includes(input.kind)) return yield* new InvalidActivityError({ field: "kind", value: input.kind });
    const subject = input.subject.trim();
    if (subject === "" || subject.length > 200) return yield* new InvalidActivityError({ field: "subject", value: input.subject });
    if (!input.opportunityId && !input.contactId && !input.companyId) return yield* new InvalidActivityError({ field: "target", value: "" });
    const kind = input.kind as ActivityKind;
    if (input.dueAt && !SCHEDULED_KINDS.includes(kind)) return yield* new InvalidActivityError({ field: "dueAt", value: input.dueAt.toISOString() });
    return { ...input, kind, subject };
  });

export const isOverdue = (a: { dueAt: Date | null; doneAt: Date | null }, now: Date) => a.dueAt !== null && a.doneAt === null && a.dueAt.getTime() < now.getTime();

/** Ordre d'affichage : à faire en retard, puis à faire par échéance, puis faites / notes (plus récentes d'abord). */
export const sortActivities = <T extends { dueAt: Date | null; doneAt: Date | null; createdAt: Date }>(items: readonly T[]): T[] => {
  const pending = (a: T) => a.dueAt !== null && a.doneAt === null;
  return [...items].sort((a, b) => {
    if (pending(a) !== pending(b)) return pending(a) ? -1 : 1;
    if (pending(a) && pending(b)) return a.dueAt!.getTime() - b.dueAt!.getTime();
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
};
