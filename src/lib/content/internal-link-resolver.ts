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
