/**
 * Service de recherche (brique k) — interface commune aux pilotes.
 *
 *   SEARCH_DRIVER=postgres (défaut) | meilisearch
 *
 * Pagefind n'est pas un pilote « serveur » : c'est un export statique
 * (`pnpm search:pagefind`) consommé côté navigateur ; la recherche serveur
 * reste alors sur Postgres.
 */
import { Context, Data, type Effect, Schema } from 'effect';

export const SEARCH_KINDS = ['content', 'blog_post', 'service', 'page'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export interface SearchDocument {
  readonly id: string;
  readonly siteId: string;
  readonly kind: SearchKind;
  /** Type de contenu (slug) pour `kind = content`. */
  readonly type: string | null;
  readonly entityId: string;
  readonly locale: string;
  readonly title: string;
  readonly excerpt: string | null;
  readonly body: string;
  readonly url: string;
  readonly publishedAt: string | null;
}

export const SearchQuery = Schema.Struct({
  q: Schema.Trim.pipe(Schema.check(Schema.isMinLength(2), Schema.isMaxLength(200))),
  siteId: Schema.String,
  locale: Schema.String.pipe(Schema.check(Schema.isPattern(/^[a-z]{2}(-[A-Z]{2})?$/))),
  kinds: Schema.optional(Schema.Array(Schema.Literals(SEARCH_KINDS))),
  type: Schema.optional(Schema.String.pipe(Schema.check(Schema.isPattern(/^[a-z][a-z0-9-]{0,63}$/)))),
  limit: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 100 })))),
  offset: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 10_000 })))),
});
export type SearchQuery = typeof SearchQuery.Type;

export interface SearchHit {
  readonly id: string;
  readonly kind: SearchKind;
  readonly type: string | null;
  readonly entityId: string;
  readonly title: string;
  readonly excerpt: string | null;
  /** Extrait HTML sûr : texte échappé, termes trouvés entourés de <mark>. */
  readonly highlight: string;
  readonly url: string;
  readonly publishedAt: string | null;
  readonly score: number;
}

export interface SearchResult {
  readonly total: number;
  readonly hits: readonly SearchHit[];
}

export class SearchError extends Data.TaggedError('SearchError')<{ readonly driver: string; readonly operation: string; readonly cause?: unknown }> {
  override get message() {
    return `Search ${this.driver} ${this.operation} failed`;
  }
}

export interface SearchIndexShape {
  readonly driver: 'postgres' | 'meilisearch';
  readonly upsert: (docs: readonly SearchDocument[]) => Effect.Effect<void, SearchError>;
  readonly remove: (ids: readonly string[]) => Effect.Effect<void, SearchError>;
  /** Supprime tous les documents d'un site (optionnellement d'un seul `kind`). */
  readonly clear: (siteId: string, kind?: SearchKind) => Effect.Effect<void, SearchError>;
  readonly search: (query: SearchQuery) => Effect.Effect<SearchResult, SearchError>;
}

export class SearchIndex extends Context.Service<SearchIndex, SearchIndexShape>()('polyweb/SearchIndex') {}

/** Identifiant stable et compatible Meilisearch (a-z A-Z 0-9 - _). */
export function documentId(kind: SearchKind, entityId: string, locale: string): string {
  return `${kind}_${entityId}_${locale}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 200);
}

const PRE = '\u0001';
const POST = '\u0002';
export const HIGHLIGHT_TAGS = { pre: PRE, post: POST } as const;

/** Échappe le texte puis convertit les marqueurs sentinelles en <mark>. */
export function safeHighlight(raw: string): string {
  const escaped = raw.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  return escaped.replaceAll(PRE, '<mark>').replaceAll(POST, '</mark>');
}
