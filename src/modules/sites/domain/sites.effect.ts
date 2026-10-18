/** Façade Effect du multi-site (brique j) : erreurs typées pour les écrans d'admin. */
import { Effect } from 'effect';
import { ZodError } from 'astro/zod';
import { ConflictError, DbError, NotFoundError, ValidationError } from '@/lib/effect/errors';
import { createSite, deleteSite, getSiteById, listSites, clearSiteCache, SiteDomainConflictError, updateSite, type SiteInput } from './sites';

const mapError = (operation: string) => (cause: unknown) => {
  if (cause instanceof SiteDomainConflictError) return new ConflictError({ reason: cause.message });
  if (cause instanceof ZodError) return new ValidationError({ issues: cause.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })) });
  const pg = cause as { code?: string; cause?: { code?: string } };
  if (pg.code === '23505' || pg.cause?.code === '23505') return new ConflictError({ reason: 'Ce slug est déjà utilisé' });
  if (cause instanceof Error && /défaut/.test(cause.message)) return new ConflictError({ reason: cause.message });
  return new DbError({ operation, cause });
};

export const sitesList = Effect.tryPromise({ try: () => (clearSiteCache(), listSites()), catch: mapError('sites.list') });

export const siteGet = (id: string) =>
  Effect.gen(function* () {
    const site = yield* Effect.tryPromise({ try: () => getSiteById(id), catch: mapError('sites.get') });
    if (!site) return yield* new NotFoundError({ entity: 'site', id });
    return site;
  });

export const siteCreate = (input: SiteInput) => Effect.tryPromise({ try: () => createSite(input), catch: mapError('sites.create') });
export const siteUpdate = (id: string, input: SiteInput) =>
  Effect.gen(function* () {
    yield* siteGet(id);
    return yield* Effect.tryPromise({ try: () => updateSite(id, input), catch: mapError('sites.update') });
  });
export const siteDelete = (id: string) => Effect.tryPromise({ try: () => deleteSite(id), catch: mapError('sites.delete') });
