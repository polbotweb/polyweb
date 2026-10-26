/**
 * Relances (pures) : échéance d'une facture et prochaine relance due selon un barème de niveaux
 * (jours après échéance). Le déclenchement (envoi) relève du service ; ici, uniquement la règle.
 */
import { Effect } from "effect";
import { InvalidNumberingDateError } from "@/core/numbering";

/** Barème par défaut : J+7, J+15, J+30 après échéance. */
export const DEFAULT_REMINDER_LEVELS = [7, 15, 30] as const;

const DAY_MS = 86_400_000;

const parseDay = (date: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  const value = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const check = new Date(value);
  return check.getUTCMonth() === Number(match[2]) - 1 && check.getUTCDate() === Number(match[3]) ? value : null;
};

/** Date d'échéance = date d'émission + délai (jours), AAAA-MM-JJ. */
export const dueDateFrom = (issueDate: string, termDays: number): Effect.Effect<string, InvalidNumberingDateError> => {
  const day = parseDay(issueDate);
  return day === null || !Number.isInteger(termDays) || termDays < 0
    ? Effect.fail(new InvalidNumberingDateError({ date: issueDate }))
    : Effect.succeed(new Date(day + termDays * DAY_MS).toISOString().slice(0, 10));
};

/** Jours de retard (0 si non échue). */
export const daysOverdue = (dueDate: string, today: string): Effect.Effect<number, InvalidNumberingDateError> => {
  const due = parseDay(dueDate);
  const now = parseDay(today);
  if (due === null) return Effect.fail(new InvalidNumberingDateError({ date: dueDate }));
  if (now === null) return Effect.fail(new InvalidNumberingDateError({ date: today }));
  return Effect.succeed(Math.max(0, Math.round((now - due) / DAY_MS)));
};

/**
 * Prochain niveau de relance à envoyer (1-based) ou null : le plus haut niveau atteint non encore
 * envoyé (`sentLevel` = dernier niveau envoyé, 0 si aucun). Pas de rattrapage multiple : un seul envoi.
 */
export const nextReminderLevel = (input: { readonly dueDate: string; readonly today: string; readonly sentLevel: number; readonly levels?: readonly number[] }) =>
  Effect.map(daysOverdue(input.dueDate, input.today), (overdue) => {
    const levels = input.levels ?? DEFAULT_REMINDER_LEVELS;
    let reached = 0;
    for (const [index, days] of levels.entries()) if (overdue >= days) reached = index + 1;
    return reached > input.sentLevel ? reached : null;
  });
