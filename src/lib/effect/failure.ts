/**
 * Échec métier typé (`ActionFailure`), sans dépendance d'exécution à `astro:actions` :
 * importable par les services appelés hors d'une action (webhooks, cron, bootstrap, tests).
 * `@/lib/effect/action` le réexporte et le convertit en `ActionError` à la frontière.
 */
import type { ActionError } from 'astro:actions';
import { Data, Effect } from 'effect';

export type ActionErrorCode = ConstructorParameters<typeof ActionError>[0]['code'];

/** Échec métier explicite, avec le message affiché à l'utilisateur. */
export class ActionFailure extends Data.TaggedError('ActionFailure')<{ readonly code: ActionErrorCode; readonly message: string }> {}

export const fail = (code: ActionErrorCode, message: string) => Effect.fail(new ActionFailure({ code, message }));
