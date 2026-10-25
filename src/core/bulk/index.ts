/**
 * Actions groupées génériques (core) — utilisables par tout module.
 *
 * Contrat (tout ou rien) :
 *  1. sélection validée (non vide, sans doublon, ≤ maxItems) ;
 *  2. permission vérifiée par opération (`authorize`, fourni par le module) ;
 *  3. lignes chargées dans le périmètre du module (tenant…) : une ligne absente = refus global ;
 *  4. garde facultative (verrous d'édition…) puis validation de CHAQUE ligne avant toute écriture ;
 *  5. application dans UNE transaction, par lots (`batchSize`) ;
 *  6. audit par ligne (`bulk: true`, `batchId` commun) puis `afterCommit` (cache…).
 * La confirmation côté UI est déclarée par l'opération (`destructive`, `confirmationKey`) et
 * exploitée par `confirmAdminAction` ; le serveur ne fait jamais confiance au client.
 */
import { Data, Effect } from "effect";

export type BulkErrorCode = "BAD_REQUEST" | "FORBIDDEN" | "CONFLICT" | "INTERNAL_SERVER_ERROR";

export class BulkActionError extends Data.TaggedError("BulkActionError")<{
  readonly code: BulkErrorCode;
  readonly message: string;
  /** Lignes rejetées par la validation (id → raison), le cas échéant. */
  readonly rejected?: ReadonlyArray<{ readonly id: string; readonly reason: string }>;
  readonly cause?: unknown;
}> {}

export interface BulkOperationDefinition<Row, Tx, Actor> {
  /** Validation métier d'une ligne (transition de statut…) : message d'erreur ou null. */
  readonly validate?: (row: Row, actor: Actor) => string | null;
  /** Écriture d'une ligne dans la transaction. */
  readonly apply: (tx: Tx, row: Row, actor: Actor) => Promise<void>;
  /** Action d'audit journalisée pour chaque ligne. */
  readonly auditAction: string;
  /** Métadonnées d'audit supplémentaires par ligne. */
  readonly auditMetadata?: (row: Row) => Record<string, unknown>;
  /** UI : opération destructive → confirmation obligatoire. */
  readonly destructive?: boolean;
  readonly confirmationKey?: string;
}

export interface BulkActionSpec<Row extends { readonly id: string }, Op extends string, Tx, Actor, EAuth = never, ELoad = never, EGuard = never> {
  /** Ressource auditée (ex. "blog_posts"). */
  readonly resource: string;
  readonly operations: { readonly [K in Op]: BulkOperationDefinition<Row, Tx, Actor> };
  readonly maxItems?: number;
  readonly batchSize?: number;
  /** Permission par opération ; échoue avec l'erreur du module. */
  readonly authorize: (operation: Op) => Effect.Effect<Actor, EAuth>;
  /** Charge les lignes demandées DANS le périmètre autorisé (tenant…). */
  readonly load: (ids: readonly string[]) => Effect.Effect<readonly Row[], ELoad>;
  /** Garde avant écriture (verrous d'édition…). */
  readonly guard?: (ids: readonly string[], actor: Actor) => Effect.Effect<void, EGuard>;
  /** Transaction de la base (Drizzle `db.transaction`, etc.). */
  readonly transaction: <A>(body: (tx: Tx) => Promise<A>) => Promise<A>;
  /** Journalisation d'audit (ne doit pas échouer). */
  readonly audit: (actor: Actor, action: string, entry: { resource: string; resourceId: string; metadata: Record<string, unknown> }) => void;
  readonly afterCommit?: (operation: Op, rows: readonly Row[]) => void;
}

export interface BulkActionInput<Op extends string> {
  readonly ids: readonly string[];
  readonly operation: Op;
}

export interface BulkActionResult<Op extends string> {
  readonly operation: Op;
  readonly batchId: string;
  readonly updated: number;
}

export const DEFAULT_BULK_MAX_ITEMS = 100;
export const DEFAULT_BULK_BATCH_SIZE = 25;

const bad = (message: string) => new BulkActionError({ code: "BAD_REQUEST", message });

/** Sélection : non vide, sans doublon, bornée. */
export function validateSelection(ids: readonly string[], maxItems = DEFAULT_BULK_MAX_ITEMS): Effect.Effect<readonly string[], BulkActionError> {
  if (ids.length === 0) return Effect.fail(bad("Sélection vide."));
  if (ids.length > maxItems) return Effect.fail(bad(`Sélection trop grande (${ids.length} > ${maxItems}).`));
  if (ids.some((id) => !id.trim())) return Effect.fail(bad("Identifiant vide dans la sélection."));
  if (new Set(ids).size !== ids.length) return Effect.fail(bad("Identifiants en double dans la sélection."));
  return Effect.succeed(ids);
}

export function chunkItems<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be >= 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Exécute une action groupée selon le contrat ci-dessus. */
export function runBulkAction<Row extends { readonly id: string }, Op extends string, Tx, Actor, EAuth, ELoad, EGuard>(
  spec: BulkActionSpec<Row, Op, Tx, Actor, EAuth, ELoad, EGuard>,
  input: BulkActionInput<Op>,
): Effect.Effect<BulkActionResult<Op>, BulkActionError | EAuth | ELoad | EGuard> {
  return Effect.gen(function* () {
    const definition = spec.operations[input.operation];
    if (!definition) return yield* Effect.fail(bad(`Opération inconnue : ${String(input.operation)}.`));
    const ids = yield* validateSelection(input.ids, spec.maxItems ?? DEFAULT_BULK_MAX_ITEMS);
    const actor = yield* spec.authorize(input.operation);

    const rows = yield* spec.load(ids);
    const found = new Set(rows.map((r) => r.id));
    if (rows.length !== ids.length || ids.some((id) => !found.has(id))) {
      return yield* Effect.fail(new BulkActionError({ code: "FORBIDDEN", message: "Un ou plusieurs éléments ne sont pas accessibles." }));
    }
    if (spec.guard) yield* spec.guard(ids, actor);

    const rejected = rows.flatMap((row) => {
      const reason = definition.validate?.(row, actor) ?? null;
      return reason ? [{ id: row.id, reason }] : [];
    });
    if (rejected.length > 0) {
      return yield* Effect.fail(new BulkActionError({ code: "BAD_REQUEST", message: rejected[0]!.reason, rejected }));
    }

    const batchSize = spec.batchSize ?? DEFAULT_BULK_BATCH_SIZE;
    yield* Effect.tryPromise({
      try: () => spec.transaction(async (tx) => {
        for (const batch of chunkItems(rows, batchSize)) {
          for (const row of batch) await definition.apply(tx, row, actor);
        }
      }),
      catch: (cause) => new BulkActionError({ code: "INTERNAL_SERVER_ERROR", message: "Action groupée annulée : aucune modification appliquée.", cause }),
    });

    const batchId = crypto.randomUUID();
    for (const row of rows) {
      spec.audit(actor, definition.auditAction, {
        resource: spec.resource,
        resourceId: row.id,
        metadata: { bulk: true, batchId, operation: input.operation, count: rows.length, ...(definition.auditMetadata?.(row) ?? {}) },
      });
    }
    spec.afterCommit?.(input.operation, rows);
    return { operation: input.operation, batchId, updated: rows.length };
  }).pipe(Effect.withSpan("core.bulk", { attributes: { "bulk.resource": spec.resource, "bulk.operation": input.operation, "bulk.count": input.ids.length } }));
}

/** Métadonnées UI d'une opération (confirmation) — sans logique serveur. */
export function bulkOperationUi<Op extends string>(operations: { readonly [K in Op]: Pick<BulkOperationDefinition<never, never, never>, "destructive" | "confirmationKey"> }, op: Op) {
  const def = operations[op];
  return { requiresConfirmation: def.destructive === true || Boolean(def.confirmationKey), confirmationKey: def.confirmationKey ?? null };
}
