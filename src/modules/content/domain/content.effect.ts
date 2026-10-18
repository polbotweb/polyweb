/**
 * Façade Effect du domaine contenu (brique b).
 *
 * Les entrées sont implémentées nativement en Effect dans `entries.ts`
 * (`*Effect`) ; cette façade leur donne des noms courts et convertit
 * « absent » en `NotFoundError`. Les types de contenu passent par `content-types.ts`.
 */
import { Effect } from 'effect';
import { DbError, NotFoundError } from '@/lib/effect/errors';
import {
  createEntryEffect,
  deleteEntryEffect,
  getEntryBySlugEffect,
  getEntryEffect,
  listEntriesEffect,
  setEntryStatusEffect,
  updateEntryEffect,
  type ContentError,
  type Entry,
  type FullEntry,
  type ListOptions,
  type SaveEntryInput,
} from './entries';
import { getContentTypeEffect, listContentTypesEffect, type ContentType } from './content-types';
import type { ContentStatus } from '@database/schemas/content.schema';

export type { ContentError };

const orNotFound =
  (entity: string, id: string) =>
  <A, E>(effect: Effect.Effect<A | undefined, E>): Effect.Effect<A, E | NotFoundError> =>
    Effect.flatMap(effect, (value) => (value === undefined ? Effect.fail(new NotFoundError({ entity, id })) : Effect.succeed(value)));

export const listTypes = (siteId: string): Effect.Effect<ContentType[], DbError> => listContentTypesEffect(siteId);

export const findType = (siteId: string, slugOrId: string): Effect.Effect<ContentType, NotFoundError | DbError> =>
  getContentTypeEffect(siteId, slugOrId).pipe(orNotFound('ContentType', slugOrId));

export const list = (type: ContentType, opts: ListOptions) => listEntriesEffect(type, opts);

export const findEntry = (type: ContentType, id: string): Effect.Effect<FullEntry, NotFoundError | DbError> =>
  getEntryEffect(type, id).pipe(orNotFound('Entry', id));

export const findBySlug = (type: ContentType, slug: string, opts: { includeDrafts?: boolean } = {}): Effect.Effect<FullEntry, NotFoundError | DbError> =>
  getEntryBySlugEffect(type, slug, { publishedOnly: !opts.includeDrafts }).pipe(orNotFound('Entry', slug));

export const create = (type: ContentType, input: SaveEntryInput, opts: { authorId: string | null; allowedLocales: readonly string[] }): Effect.Effect<Entry, ContentError> =>
  createEntryEffect(type, input, opts);

export const update = (
  type: ContentType,
  id: string,
  input: SaveEntryInput,
  opts: { authorId: string | null; allowedLocales: readonly string[]; expectedVersion?: number },
): Effect.Effect<Entry, ContentError> => updateEntryEffect(type, id, input, opts);

export const setStatus = (type: ContentType, id: string, status: ContentStatus, authorId: string | null) => setEntryStatusEffect(type, id, status, authorId);

export const remove = (type: ContentType, id: string) => Effect.flatMap(findEntry(type, id), () => deleteEntryEffect(type, id));
