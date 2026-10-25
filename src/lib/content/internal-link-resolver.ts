import { Duration, Effect } from 'effect';
import { DbError, NotFoundError } from '@/lib/effect/errors';

/**
 * Internal link resolver registry.
 *
 * Editorial content (blog posts, future "services", "formations", CMS pages…)
 * can embed internal links to other entities. Each module that owns linkable
 * entities registers a resolver here so the generic ContentEditor / RichContent
 * components can:
 *   - resolve a slug/id to a public URL (for insertion & rendering),
 *   - validate that a target still exists (for dead-link detection).
 *
 * This keeps the content layer fully decoupled from any specific module.
 */

export interface InternalLinkResolution {
  /** Public, locale-aware URL (absolute path). */
  href: string;
  /** Human-readable title for the link label / tooltip. */
  title: string | null;
  /** Whether the target entity still exists. */
  exists: boolean;
}

export interface InternalLinkResolver {
  /** Stable key used by the editor to pick the right resolver (e.g. "blog"). */
  name: string;
  /**
   * Resolve a target identifier (slug or id) to a URL + existence flag.
   * Must be safe to call many times (it may hit the DB / cache).
   */
  resolve(target: string, ctx: { locale: string; organizationId?: string | null }): Promise<InternalLinkResolution>;
  /**
   * Return the set of valid target identifiers for a tenant, used to detect
   * dead links in rendered HTML without N+1 queries.
   */
  listValidTargets(ctx: { locale: string; organizationId?: string | null }): Promise<Set<string>>;
  /**
   * Search targets by query, for the editor's internal-link picker.
   */
  search(query: string, ctx: { locale: string; organizationId?: string | null; limit?: number }): Promise<
    { id: string; label: string; href: string }[]
  >;
}

const registry = new Map<string, InternalLinkResolver>();

export function registerInternalLinkResolver(resolver: InternalLinkResolver): void {
  registry.set(resolver.name, resolver);
}

export function getInternalLinkResolver(name: string): InternalLinkResolver | undefined {
  return registry.get(name);
}

export function hasInternalLinkResolver(name: string): boolean {
  return registry.has(name);
}

// ─── Vue Effect du registre ───────────────────────────────────────────────────
// Les résolveurs restent des objets Promise (contrat ouvert aux modules) ; ces
// fonctions les exécutent en Effect avec erreurs typées et délai borné.


type LinkContext = { locale: string; organizationId?: string | null; limit?: number };

const RESOLVER_TIMEOUT = Duration.seconds(10);

/** Résolveur enregistré, ou `NotFoundError` (entité `internal-link-resolver`). */
export const getInternalLinkResolverEffect = (name: string): Effect.Effect<InternalLinkResolver, NotFoundError> => {
  const resolver = registry.get(name);
  return resolver ? Effect.succeed(resolver) : Effect.fail(new NotFoundError({ entity: 'internal-link-resolver', id: name }));
};

const callResolver = <A>(name: string, op: string, f: (r: InternalLinkResolver) => Promise<A>) =>
  getInternalLinkResolverEffect(name).pipe(
    Effect.flatMap((resolver) =>
      Effect.tryPromise({ try: () => f(resolver), catch: (cause) => new DbError({ operation: `internal-link.${name}.${op}`, cause }) }),
    ),
    Effect.timeoutOrElse({
      duration: RESOLVER_TIMEOUT,
      orElse: () => Effect.fail(new DbError({ operation: `internal-link.${name}.${op}`, cause: new Error('timeout') })),
    }),
    Effect.withSpan(`internal-link ${name}.${op}`),
  );

export const resolveInternalLinkEffect = (name: string, target: string, ctx: LinkContext) =>
  callResolver(name, 'resolve', (r) => r.resolve(target, ctx));

export const listInternalLinkTargetsEffect = (name: string, ctx: LinkContext) =>
  callResolver(name, 'listValidTargets', (r) => r.listValidTargets(ctx));

export const searchInternalLinksEffect = (name: string, query: string, ctx: LinkContext) =>
  callResolver(name, 'search', (r) => r.search(query, ctx));
