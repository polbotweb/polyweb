/**
 * Relances planifiées génériques (N6-A) : chaque module déclare des sources de relance
 * (`ReminderSource`) dans ses définitions de notifications ; le cron `/api/cron/reminders`
 * les exécute toutes. Chaque source doit être idempotente (clés de déduplication) : une
 * exécution répétée ou concurrente ne renvoie jamais deux fois la même relance.
 * Une source en échec n'empêche pas les autres ; seuls l'id de source et le tag d'erreur sont journalisés.
 */
import { Effect } from "effect";
import type { AppConfig } from "@/lib/effect/config";

export interface ReminderSource {
  /** Identifiant stable `module.nom` (ex. `sales.invoices`). */
  readonly id: string;
  /** Traite les relances dues à `now` ; renvoie le nombre de relances émises. */
  readonly run: (now: Date) => Effect.Effect<number, unknown, AppConfig>;
}

export interface ReminderRunResult {
  readonly source: string;
  readonly sent: number;
  readonly error?: string;
}

const ID = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9.-]*$/;
const sources = new Map<string, ReminderSource>();

export function registerReminderSources(list: readonly ReminderSource[]): void {
  for (const source of list) {
    if (!ID.test(source.id)) throw new Error(`Invalid reminder source id: ${source.id}`);
    sources.set(source.id, source);
  }
}

export const listReminderSources = (): readonly ReminderSource[] => [...sources.values()];

export function clearReminderSourcesForTests(): void {
  sources.clear();
}

const errorTag = (error: unknown): string =>
  typeof error === "object" && error !== null && "_tag" in error && typeof (error as { _tag: unknown })._tag === "string" ? (error as { _tag: string })._tag : "UnknownError";

/** Exécute toutes les sources (ou celles de `only`), en série, sans jamais échouer globalement. */
export const runReminders = ({ now = new Date(), only }: { now?: Date; only?: readonly string[] } = {}) =>
  Effect.forEach(
    listReminderSources().filter((s) => !only || only.includes(s.id)),
    (source) =>
      source.run(now).pipe(
        Effect.map((sent): ReminderRunResult => ({ source: source.id, sent })),
        Effect.catch((error) =>
          Effect.logWarning("reminders.source.failed", { source: source.id, error: errorTag(error) }).pipe(
            Effect.as<ReminderRunResult>({ source: source.id, sent: 0, error: errorTag(error) }),
          ),
        ),
      ),
  ).pipe(Effect.withSpan("notifications.reminders.run"));
