/** Authentification des endpoints cron (`Authorization: Bearer $CRON_SECRET`). */
import { timingSafeEqual } from 'node:crypto';
import { Effect } from 'effect';
import { AppConfig } from './config';
import { UnauthorizedError } from './errors';

export function isCronAuthorized(request: Request, env: Readonly<Record<string, string | undefined>>): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) {
    // Sans secret : refusé en production ; en dev/test seulement en accès direct (sans proxy).
    if (env.NODE_ENV === 'production') return false;
    return !request.headers.get('x-forwarded-for');
  }
  const bearer = request.headers.get('authorization');
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

export const requireCron = (request: Request) =>
  AppConfig.use((config) =>
    isCronAuthorized(request, config.env) ? Effect.void : Effect.fail(new UnauthorizedError({ reason: 'Invalid cron secret' })),
  );
