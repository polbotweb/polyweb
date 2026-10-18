# Atomic CMS + Blog convergence

Blog is the first complete Atomic domain module. It remains authoritative for Blog-specific schema and behavior while consuming shared CMS/Admin capabilities.

## Architecture

```text
src/modules/blog/
├── admin
├── actions
├── components/{cards,lists,single,ui}
├── domain
├── i18n
├── loaders
├── permissions
├── schema
├── search
├── seo
├── utils
└── validation
```

The module uses Astro SSR, Astro Actions, Drizzle, Zod, shared Media, the generic ContentEditor, tenant guards, RBAC, audit, cache, search and shared administrative resource primitives.

Concordia contributed validated editorial/admin product patterns only. Its API and schema architecture are not copied into Atomic.

## Module capabilities

Blog declares shared capabilities for content, localization, media, SEO, taxonomy, search, publication/workflow, revisions, locks, engagement, moderation, notifications, audit and cache.

Its public/editorial presentation follows the module grammar:

```text
cards / lists / single / ui
```

Shared design-system primitives remain domain-neutral.

## Editorial lifecycle

```text
DRAFT      -> PUBLISHED | ARCHIVED | DELETED
PUBLISHED  -> DRAFT | ARCHIVED | DELETED
ARCHIVED   -> DRAFT | DELETED
DELETED    -> DRAFT
```

Ordinary post updates cannot change publication state. Explicit lifecycle Actions own publish, unpublish, archive, restore and delete so transition validation, authorization, revisions, audit and cache invalidation remain consistent.

## Duplication

`duplicateBlogPost` creates a new draft. It copies editorial data such as translations, categories, tags, localized SEO, galleries, safe editorial links, author and relevant settings. It does not copy views, comments, moderation state, reviews, reactions, favorites, notifications, locks, analytics or revision history.

The duplicate receives a new creation revision.

## Revisions and locks

Meaningful editorial changes create append-only revisions. Restoring a revision never overwrites history; it applies the selected state and creates a new restoration revision.

Locks are session-aware and expiring. Concurrent editing produces an explicit conflict rather than silently taking control.

## Taxonomy

Categories are hierarchical and use the shared acyclicity invariant. Category/tag/media references are validated against the active tenant before mutation.

Relations remain explicit Blog relations. No polymorphic taxonomy relation system is introduced.

## Administration

Blog uses the shared Admin Resource model for both global and organization administration.

The unified Blog admin exposes:

```text
Posts
Categories
Tags
Moderation
Statistics
```

Post management includes search, status/category/tag/author/featured/sticky/locale filters, sorting, pagination and explicit lifecycle actions. Global statistics are tenant-wide aggregates, not counts derived from the visible page.

The organization surface uses the same resource and domain Actions with the organization tenant resolved from the route. It does not duplicate Blog business logic.

## Localization

The editor supports `fr`, `en`, `es` and `ar`. Locale switching is protected against accidental loss of unsaved changes. Localized content and localized slugs remain relational rows rather than JSONB translation maps.

Arabic uses the shared RTL-capable primitives.

## Content and links

The generic ContentEditor remains domain-agnostic. Blog registers the `blog` resolver for internal links.

Admin internal-link management uses searchable target selection rather than `window.prompt()`, prevents self-links and respects tenant scope.

## Media

Blog uses the Atomic shared Media and MediaPicker infrastructure for featured/OG/inline/gallery media. There is no `blog_media` table.

## Engagement and moderation

Blog retains its richer comments, reviews, reactions, favorites, reports and moderation model. Shared capability contracts describe the cross-module boundary while Blog retains its domain-specific semantics.

Reaction uniqueness and replacement semantics are enforced so one user has at most one active reaction type per post.

Notification target relationships are type-specific rather than relying on a destructive blanket XOR rule.

## Search and public data

Public Blog loaders are always tenant-scoped, locale-scoped and publication-scoped. They never expose drafts, archived posts or deleted posts.

Search continues to use Atomic's PostgreSQL full-text search architecture rather than a second `%query%` search engine.

## Public routes

Canonical routes remain localized and support global and organization contexts, category/tag pages, author pages and canonical post URLs. Organization routes never bypass organization ownership checks.

## Security and tenancy

Mutations follow the Atomic domain sequence:

```text
validate
→ resolve tenant
→ authorize
→ validate referenced ownership
→ validate business invariants
→ transaction
→ revision / event / audit
→ targeted cache invalidation
```

Content is sanitized before persistence and rendering defenses remain in place.

## What was not imported from Concordia

```text
no blog_media
no blog_authors
no parallel REST admin API
no JSONB localization model
no polymorphic CMS content table
no duplicate media/workflow/search engine
no module-specific visual framework
```

## Shared CMS boundary

Blog now lives beside Services as a first-class module:

```text
src/modules/blog/
src/modules/services/
```

Both consume `src/core` capability contracts and the same Admin Resource grammar. Future modules such as Formations, Courses, Shop and Events should follow this pattern rather than copying Blog.