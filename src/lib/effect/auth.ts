/** Garde de session/permission pour les routes API internes (cookies Better Auth). */
import { Effect } from 'effect';
import { userCan } from '@/lib/platform/admin';
import { DbError, ForbiddenError, UnauthorizedError } from './errors';

export const requireSessionPermission = (locals: App.Locals, permissions: Record<string, string[]>) =>
  Effect.gen(function* () {
    const user = locals.user;
    if (!user || (user as { banned?: boolean }).banned) return yield* new UnauthorizedError({ reason: 'Session required' });
    const ok = yield* Effect.tryPromise({ try: () => userCan(user.id, permissions), catch: (cause) => new DbError({ operation: 'auth.userCan', cause }) });
    if (!ok) return yield* new ForbiddenError({ reason: 'Permission denied' });
    return user;
  });
