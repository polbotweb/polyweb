/**
 * Adaptateur Astro Actions ↔ Effect.
 *
 * `effectHandler((input, ctx) => Effect…)` produit un `handler` d'action :
 * le programme s'exécute (Effect.runPromise, sans dépendance au runtime
 * partagé pour rester testable avec les mocks unitaires) et ses erreurs
 * typées deviennent des `ActionError` :
 *   ActionFailure(code, message) → code/message tels quels (messages UI)
 *   UnauthorizedError → UNAUTHORIZED, ForbiddenError → FORBIDDEN,
 *   NotFoundError → NOT_FOUND, ConflictError → CONFLICT,
 *   ValidationError → BAD_REQUEST, RateLimitedError → TOO_MANY_REQUESTS,
 *   autres (DbError, OperationError…) → rejet de la cause (500 côté Astro).
 * Une `ActionError` levée par du code Promise appelé via `actionTry` est relevée telle quelle.
 */
import { ActionError, type ActionAPIContext } from 'astro:actions';
import { Data, Effect, Exit } from 'effect';
import { checkRateLimit } from '@/lib/rate-limit';
import { OperationError } from './errors';

type ActionErrorCode = ConstructorParameters<typeof ActionError>[0]['code'];

/** Échec métier explicite, avec le message affiché à l'utilisateur. */
export class ActionFailure extends Data.TaggedError('ActionFailure')<{ readonly code: ActionErrorCode; readonly message: string }> {}

export const fail = (code: ActionErrorCode, message: string) => Effect.fail(new ActionFailure({ code, message }));

/** Appel Promise dans une action : `ActionError` conservée, autre rejet → `OperationError`. */
export const actionTry = <A>(operation: string, f: () => Promise<A>) =>
  Effect.tryPromise({ try: f, catch: (cause) => (cause instanceof ActionError ? new ActionFailure({ code: cause.code, message: cause.message }) : new OperationError({ operation, cause })) }).pipe(
    Effect.withSpan(`action ${operation}`),
  );

const STATUS: Record<string, ActionErrorCode> = {
  UnauthorizedError: 'UNAUTHORIZED',
  ForbiddenError: 'FORBIDDEN',
  NotFoundError: 'NOT_FOUND',
  ConflictError: 'CONFLICT',
  ValidationError: 'BAD_REQUEST',
  RateLimitedError: 'TOO_MANY_REQUESTS',
  LockHeldError: 'CONFLICT',
  LockExpiredError: 'CONFLICT',
  LockReleaseForbiddenError: 'FORBIDDEN',
  LockResourceNotFoundError: 'NOT_FOUND',
};

export function toActionError(error: unknown): unknown {
  if (error instanceof ActionError) return error;
  const tagged = error as { _tag?: string; message?: string; code?: ActionErrorCode; cause?: unknown };
  if (tagged?._tag === 'ActionFailure') return new ActionError({ code: tagged.code!, message: tagged.message ?? '' });
  const code = tagged?._tag ? STATUS[tagged._tag] : undefined;
  if (code) return new ActionError({ code, message: tagged.message ?? code });
  if (tagged?._tag && 'cause' in tagged && tagged.cause !== undefined) return tagged.cause;
  return error;
}

export function effectHandler<I, A, E>(program: (input: I, context: ActionAPIContext) => Effect.Effect<A, E>) {
  return async (input: I, context: ActionAPIContext): Promise<A> => {
    const exit = await Effect.runPromiseExit(program(input, context));
    if (Exit.isSuccess(exit)) return exit.value;
    const reason = exit.cause.reasons.find((r) => r._tag === 'Fail' || r._tag === 'Die');
    if (reason?._tag === 'Fail') throw toActionError(reason.error);
    if (reason?._tag === 'Die') throw toActionError(reason.defect);
    throw new Error('Action interrompue');
  };
}

/** Exécute une garde Effect côté appelant Promise : relève l'échec en `ActionError` (ou la cause d'infrastructure brute). */
export async function runGuard<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const reason = exit.cause.reasons.find((r) => r._tag === 'Fail' || r._tag === 'Die');
  throw toActionError(reason?._tag === 'Fail' ? reason.error : reason?._tag === 'Die' ? reason.defect : exit.cause);
}

// --- Gardes communes (équivalents Effect de src/actions/admin/_helpers.ts) ---

type Permissions = Record<string, string[]>;

/** Session requise (message UI propre à l'appelant). */
export const requireUser = (context: Pick<ActionAPIContext, 'locals'>, message = 'Vous devez être connecté pour effectuer cette action.') =>
  Effect.suspend(() => {
    const user = context.locals.user;
    return user ? Effect.succeed(user) : fail('UNAUTHORIZED', message);
  });

/** Administrateur global requis (équivalent Effect d'`assertAdmin`). */
export const requireAdmin = (context: Pick<ActionAPIContext, 'locals'>) =>
  Effect.suspend(() => {
    const user = context.locals.user;
    if (!user) return fail('UNAUTHORIZED', 'Vous devez être connecté pour effectuer cette action.');
    if (user.role !== 'admin') return fail('FORBIDDEN', 'Accès réservé aux administrateurs.');
    if (user.banned) return fail('FORBIDDEN', 'Compte suspendu.');
    return Effect.succeed(user);
  });

/** Session + RBAC better-auth (`userHasPermission`). */
export const requireActionPermission = (context: ActionAPIContext, permissions: Permissions) =>
  Effect.gen(function* () {
    const user = context.locals.user;
    if (!user) return yield* fail('UNAUTHORIZED', 'Vous devez être connecté pour effectuer cette action.');
    if (user.banned) return yield* fail('FORBIDDEN', 'Compte suspendu.');
    const result = yield* actionTry('auth.userHasPermission', () =>
      import('@/lib/auth').then((m) => m.auth.api.userHasPermission({ body: { userId: user.id, permissions } })),
    );
    if (!result.success) return yield* fail('FORBIDDEN', 'Permissions insuffisantes pour cette action.');
    return user;
  });

/**
 * Garde tenant (core `permissions/tenant`) pour une ressource de l'organisation
 * `organizationId` (`null` = plateforme) :
 * - administrateur global : tout ;
 * - ressource plateforme : RBAC global (`userHasPermission`) ;
 * - ressource d'organisation : propriétaire / administrateur de CETTE organisation
 *   uniquement (autre organisation ou simple membre → FORBIDDEN).
 */
export const requireTenantPermission = (context: ActionAPIContext, permissions: Permissions, organizationId: string | null) =>
  Effect.gen(function* () {
    const user = context.locals.user;
    if (!user) return yield* fail('UNAUTHORIZED', 'Vous devez être connecté pour effectuer cette action.');
    if (user.banned) return yield* fail('FORBIDDEN', 'Compte suspendu.');
    const tenant = yield* actionTry('permissions.tenant', () => import('@/core/permissions/tenant'));
    if (tenant.isGlobalAdmin(user)) return user;
    if (organizationId === null) return yield* requireActionPermission(context, permissions);
    const organizationRole = yield* tenant.organizationRoleOf(user.id, organizationId);
    if (!tenant.tenantAdminDecision({ actor: user, organizationId, organizationRole })) {
      return yield* fail('FORBIDDEN', "Vous ne pouvez gérer que le contenu de votre organisation.");
    }
    return user;
  });

/**
 * Garde tenant d'une ressource existante : la session est vérifiée AVANT toute
 * lecture (pas de fuite d'existence), puis l'organisation de la ressource est lue
 * (`loadOrganization` → `[]` si introuvable → NOT_FOUND) et `requireTenantPermission` appliquée.
 */
export const requireTenantResourcePermission = (
  context: ActionAPIContext,
  permissions: Permissions,
  loadOrganization: () => Promise<ReadonlyArray<{ organizationId: string | null }>>,
) =>
  Effect.gen(function* () {
    if (!context.locals.user) return yield* fail('UNAUTHORIZED', 'Vous devez être connecté pour effectuer cette action.');
    const [row] = yield* actionTry('permissions.tenantResource', loadOrganization);
    if (!row) return yield* fail('NOT_FOUND', 'Élément introuvable.');
    return yield* requireTenantPermission(context, permissions, row.organizationId ?? null);
  });

/** Limite par utilisateur et par portée (mêmes clés que `adminRateLimit`). */
export const actionRateLimit = (userId: string, scope: string, opts = { window: 60, max: 30 }) =>
  Effect.suspend(() => {
    const rl = checkRateLimit(`admin-${scope.replace(/:/g, '_')}:${userId}`, opts);
    return rl.allowed ? Effect.void : fail('TOO_MANY_REQUESTS', 'Trop de requêtes. Veuillez réessayer dans quelques instants.');
  });
