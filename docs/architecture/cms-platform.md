# Atomic CMS Platform Architecture

Atomic is a multi-tenant SSR application whose CMS is a platform for explicit domain modules. Blog and Services are the first two complete modules. Future Formations, Courses, Shop and Events must consume the same platform rather than create parallel mini-CMS implementations.

For the concrete implementation inventory of the current reference modules, see [CMS Implementation Matrix](./cms-implementation.md). For the product-level synthesis of Concordia patterns, see [Concordia → Atomic synthesis](./concordia-synthesis.md).

## Module contract

Every module owns its domain schema, actions, loaders, validation, permissions, routes, i18n and domain presentation. Shared capabilities are provided by Atomic Core.

The contract exposes:

- stable module identity and canonical entity;
- explicit platform capabilities;
- `card / list / single / ui` presentation grammar;
- a deterministic registration entry point.

The registry is explicit and bootstrap-driven. Modules are not discovered dynamically from the filesystem.

## Concrete module boundaries

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

src/modules/services/
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

These boundaries are architectural conventions, not permission to duplicate infrastructure. Existing implementation files remain canonical where extraction would only create wrappers.

## Core platform boundaries

The shared capability surface is exposed through `src/core/` and the capability catalog. Current concerns are:

```text
admin
attributes
audit
cache
capabilities
content
engagement
localization
locks
media
moderation
modules
notifications
presentation
revision
search
seo
taxonomy
workflow
```

The Core layer provides contracts and invariants while established Atomic implementations remain the implementation authority when they already exist. This avoids “folder theater”: moving code merely to make directory names symmetrical is not a goal.

## Presentation grammar

Domain components use four semantic roles:

- `cards`: compact/high-density projections;
- `lists`: collections and search results;
- `single`: canonical detail pages;
- `ui`: domain-specific metadata and interaction primitives.

Shared design-system primitives remain domain-neutral. A ServiceCard and BlogPostCard may use the same Card, Badge, Media, Rating, Price, Date or CTA primitives without becoming one generic `UniversalCard<T>`.

Presentation variants are semantic, token-driven and independent of domain behavior. Examples include `default`, `compact`, `featured`, `horizontal` or equivalent module-specific projections.

## Admin Resource contract

Admin resources expose typed capabilities for:

```text
list
search
filters
sort
pagination
stats
create
read
update
duplicate
publish
unpublish
archive
restore
delete
bulk (opt-in)
```

A resource declares its permission namespace, presentation variants and typed filter/sort definitions. Compatibility with the owning module is validated during registration.

Shared Admin Core provides resource shells, responsive data views, statistics, forms, tabs/dialog primitives, dirty-form protection and feedback patterns. Domain modules supply semantic actions and data.

## Search contract

Modules declare searchable, filterable and sortable fields through Search Core adapters. Public and admin URL state is deterministic and SSR-compatible. Search engines are not duplicated per module.

## Content / media / localization / SEO

The generic ContentEditor, sanitization pipeline, internal-link resolver, MediaPicker and Media lifecycle remain shared. Modules register their own resolvers and domain projections.

Localization remains relational (`resource × locale`). Localized slugs and SEO fields are domain data, not arbitrary JSONB maps. RTL is a shared UI property.

## Workflow, revisions and locks

The shared workflow contract validates state transitions; each module defines its own state machine. Domain Actions perform authorization, transactions, revision creation, audit and cache invalidation.

Revision and lock capabilities are reusable but do not force a polymorphic revision table. Historical revisions are append-only; restoration creates a new revision. Locks are explicit, expiring and conflict-aware.

## Taxonomy, engagement and moderation

Taxonomy uses explicit domain relations plus shared acyclicity invariants. No polymorphic `entityType/entityId` relationship table is introduced merely for genericity.

Engagement, moderation, reporting and notifications are cross-module capabilities. Domain modules opt into the parts they need and keep domain-specific semantics in their own Actions.

## Tenancy and security

Every mutation follows the same broad sequence:

```text
validate
→ resolve tenant
→ authorize
→ validate ownership
→ validate domain invariant
→ transaction
→ revision / event / audit
→ targeted cache invalidation
```

Cross-tenant references are rejected. Public loaders are narrower than admin loaders and never become admin loaders by adding a status parameter.

## CMS versus transactional cores

CMS Core owns content, localization, media, taxonomy, SEO, publication, workflow, revisions, locks, search, admin, audit and moderation hooks.

Transactional domains such as booking, enrollment, payments, inventory and orders remain separate cores consumed by modules such as Services, Courses or Shop.

## Future-module rule

Before adding another module, the module must demonstrate that it can reuse:

```text
CMS capabilities
+ Admin Resource
+ Card/List/Single/UI grammar
+ tenant/RBAC rules
+ localization
+ media
+ SEO
+ search
+ workflow
+ revision/locks
+ engagement/moderation hooks
+ audit/cache
```

A module that needs to invent `ModuleXMedia`, `ModuleXSearchEngine`, `ModuleXRevisionSystem` or `ModuleXAdminFramework` is evidence of a missing shared capability, not permission to duplicate the stack.
