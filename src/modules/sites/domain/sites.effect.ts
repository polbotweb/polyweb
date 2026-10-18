/** Façade Effect du multi-site (brique j) : noms courts + « absent » → NotFoundError. */
import { Effect } from 'effect';
import { NotFoundError } from '@/lib/effect/errors';
import { clearSiteCache, createSiteEffect, deleteSiteEffect, getSiteByIdEffect, listSitesEffect, updateSiteEffect, type SiteInput } from './sites';

export const sitesList = Effect.suspend(() => (clearSiteCache(), listSitesEffect));

export const siteGet = (id: string) =>
  Effect.flatMap(getSiteByIdEffect(id), (site) => (site ? Effect.succeed(site) : Effect.fail(new NotFoundError({ entity: 'site', id }))));

export const siteCreate = (input: SiteInput) => createSiteEffect(input);
export const siteUpdate = (id: string, input: SiteInput) => Effect.flatMap(siteGet(id), () => updateSiteEffect(id, input));
export const siteDelete = (id: string) => deleteSiteEffect(id);
