/** Garde de session/permission pour les routes API internes (cookies Better Auth). */
import { Effect } from 'effect';
import { userCanEffect } from '@/lib/platform/admin';
import { ForbiddenError, UnauthorizedError } from './errors';

export const requireSessionPermission = (locals: App.Locals, permissions: Record<string, string[]>) =>
  Effect.gen(function* () {
    const user = locals.user;
    if (!user || (user as { banned?: boolean }).banned) return yield* new UnauthorizedError({ reason: 'Session required' });
    const ok = yield* userCanEffect(user.id, permissions);
    if (!ok) return yield* new ForbiddenError({ reason: 'Permission denied' });
    return user;
  });
