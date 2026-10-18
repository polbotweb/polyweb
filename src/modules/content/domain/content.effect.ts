/**
 * Façade Effect du domaine contenu (brique b).
 *
 * Les fonctions Promise de `entries.ts` / `content-types.ts` sont exposées ici
 * comme des Effects aux erreurs typées ; le nouveau code (API v1, webhooks,
 * prévisualisation…) n'utilise que cette façade. La migration interne de
 * `entries.ts` vers Effect natif se fait sans changer ces signatures.
 */
import { Effect } from 'effect';
import { ConflictError, DbError, NotFoundError, ValidationError } from '@/lib/effect/errors';
import {
  createEntry,
  deleteEntry,
  EntryConflictError,
  EntryNotFoundError,
  EntryValidationError,
  getEntry,
  getEntryBySlug,
  getPublishedEntryBySlug,
  listEntries,
  setEntryStatus,
  updateEntry,
  type Entry,
  type FullEntry,
  type ListOptions,
  type SaveEntryInput,
} from './entries';
import { getContentType, listContentTypes, type ContentType } from './content-types';
import type { ContentStatus } from '@database/schemas/content.schema';

export type ContentError = ValidationError | ConflictError | NotFoundError | DbError;

function mapContentError(operation: string) {
  return (cause: unknown): ContentError => {
    if (cause instanceof EntryValidationError) {
      return new ValidationError({ issues: Object.entries(cause.errors).map(([path, message]) => ({ path, message })) });
    }
    if (cause instanceof EntryConflictError) return new ConflictError({ reason: cause.message });
    if (cause instanceof EntryNotFoundError) return new NotFoundError({ entity: 'Entry' });
    // zod errors thrown by slug parsing are validation errors as well.
    if (cause && typeof cause === 'object' && 'issues' in cause && Array.isArray((cause as { issues: unknown }).issues)) {
      const issues = (cause as { issues: Array<{ path: PropertyKey[]; message: string }> }).issues;
      return new ValidationError({ issues: issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })) });
    }
    return new DbError({ operation, cause });
  };
}

const lift = <A>(operation: string, f: () => Promise<A>): Effect.Effect<A, ContentError> =>
  Effect.tryPromise({ try: f, catch: mapContentError(operation) }).pipe(Effect.withSpan(`content.${operation}`));

export const listTypes = (siteId: string) =>
  lift('listTypes', () => listContentTypes(siteId)) as Effect.Effect<ContentType[], DbError>;

export const findType = (siteId: string, slugOrId: string): Effect.Effect<ContentType, NotFoundError | DbError> =>
  Effect.flatMap(
    lift('findType', () => getContentType(siteId, slugOrId)) as Effect.Effect<ContentType | undefined, DbError>,
    (t) => (t ? Effect.succeed(t) : Effect.fail(new NotFoundError({ entity: 'ContentType', id: slugOrId }))),
  );

export const list = (type: ContentType, opts: ListOptions) => lift('list', () => listEntries(type, opts));

export const findEntry = (type: ContentType, id: string): Effect.Effect<FullEntry, NotFoundError | DbError> =>
  Effect.flatMap(
    lift('findEntry', () => getEntry(type, id)) as Effect.Effect<FullEntry | undefined, DbError>,
    (e) => (e ? Effect.succeed(e) : Effect.fail(new NotFoundError({ entity: 'Entry', id }))),
  );

export const findBySlug = (
  type: ContentType,
  slug: string,
  opts: { includeDrafts?: boolean } = {},
): Effect.Effect<FullEntry, NotFoundError | DbError> =>
  Effect.flatMap(
    lift('findBySlug', () =>
      opts.includeDrafts ? getEntryBySlug(type, slug) : getPublishedEntryBySlug(type, slug),
    ) as Effect.Effect<FullEntry | undefined, DbError>,
    (e) => (e ? Effect.succeed(e) : Effect.fail(new NotFoundError({ entity: 'Entry', id: slug }))),
  );

export const create = (
  type: ContentType,
  input: SaveEntryInput,
  opts: { authorId: string | null; allowedLocales: readonly string[] },
): Effect.Effect<Entry, ContentError> => lift('create', () => createEntry(type, input, opts));

export const update = (
  type: ContentType,
  id: string,
  input: SaveEntryInput,
  opts: { authorId: string | null; allowedLocales: readonly string[]; expectedVersion?: number },
): Effect.Effect<Entry, ContentError> => lift('update', () => updateEntry(type, id, input, opts));

export const setStatus = (type: ContentType, id: string, status: ContentStatus, authorId: string | null) =>
  lift('setStatus', () => setEntryStatus(type, id, status, authorId));

export const remove = (type: ContentType, id: string) =>
  Effect.flatMap(findEntry(type, id), () => lift('remove', () => deleteEntry(type, id)));
