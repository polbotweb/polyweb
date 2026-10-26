/**
 * core/numbering — attribution SANS TROU d'un numéro de document par tenant.
 *
 * `INSERT … ON CONFLICT DO UPDATE SET last_value = last_value + 1 RETURNING` est atomique
 * et verrouille la ligne de séquence jusqu'à la fin de la transaction : appelée dans la
 * transaction qui crée le document, deux créations concurrentes sont sérialisées et un
 * rollback annule l'incrément (aucun numéro perdu, aucun doublon).
 */
import { Effect } from 'effect';
import { sql } from 'drizzle-orm';
import type { DrizzleDB } from '@/database/drizzle';
import { documentSequences } from '@/database/schemas/numbering.schema';
import { dbTry } from '@/lib/effect/run';
import { formatDocumentNumber, numberingPeriod, validatePattern, type NumberingScheme } from './format';

/** Base ou transaction Drizzle (seul `insert` est utilisé). */
export type NumberingExecutor = Pick<DrizzleDB, 'insert'>;

export interface SequenceScope {
  readonly organizationId: string | null;
  /** Type de document, ex. `invoice`, `credit-note`, `quote`. */
  readonly key: string;
  readonly period: string;
}

/** Incrémente et renvoie la valeur suivante de la séquence (1 pour une séquence neuve). */
export const nextSequenceValue = (executor: NumberingExecutor, scope: SequenceScope) =>
  dbTry('numbering.next', () =>
    executor
      .insert(documentSequences)
      .values({ organizationId: scope.organizationId, key: scope.key, period: scope.period, lastValue: 1 })
      .onConflictDoUpdate({
        target: [documentSequences.organizationId, documentSequences.key, documentSequences.period],
        set: { lastValue: sql`${documentSequences.lastValue} + 1`, updatedAt: new Date() },
      })
      .returning({ value: documentSequences.lastValue }),
  ).pipe(Effect.map((rows) => rows[0]!.value));

/** Valeur + numéro formaté pour un document daté `date` (ISO), selon le schéma du tenant. */
export const assignDocumentNumber = (
  executor: NumberingExecutor,
  input: { readonly organizationId: string | null; readonly key: string; readonly scheme: NumberingScheme; readonly date: string },
) =>
  Effect.gen(function* () {
    yield* validatePattern(input.scheme.pattern);
    const period = yield* numberingPeriod(input.scheme.reset, input.date);
    const value = yield* nextSequenceValue(executor, { organizationId: input.organizationId, key: input.key, period });
    const number = yield* formatDocumentNumber(input.scheme, value, input.date);
    return { value, period, number };
  });
