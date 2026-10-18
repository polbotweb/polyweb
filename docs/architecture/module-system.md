# Atomic Module System

## Purpose

Atomic uses a first-class module model for business domains. A module combines its domain model, validation, server actions, loaders, permissions, search definition, SEO, presentation and administration while consuming shared platform/CMS capabilities.

The architecture is deliberately modular without introducing a universal polymorphic content table.

## Physical boundaries

```text
src/core/
  admin/          # resource contracts, list/filter contracts and shared admin foundations
  attributes/     # typed extensible-attribute contracts
  audit/          # shared audit boundary
  cache/          # shared cache boundary
  capabilities/   # canonical CMS capability catalogue
  content/        # shared editor/rendering/link boundary
  engagement/     # shared engagement contracts
  localization/   # shared localization contracts
  locks/          # shared editorial-lock contracts
  moderation/     # shared moderation contracts
  modules/        # module contracts, registry and bootstrap
  notifications/  # shared notification contracts
  presentation/   # card/list/single/ui presentation grammar
  revision/       # shared revision contracts
  search/         # resource search contracts
  seo/            # shared SEO contracts
  taxonomy/       # hierarchy/taxonomy invariants
  workflow/       # shared lifecycle transition contracts

src/modules/
  blog/
  services/
  # future: formations/, courses/, shop/, events/, ...
```

Existing platform implementations may remain in their established locations when moving them would add no architectural value. Core boundaries are contracts/adapters and must not create duplicate implementations.

## Module contract

A first-class module declares:

- a stable module id and owned entity;
- all CMS capabilities it consumes;
- a concrete provider for every enabled capability;
- presentation variants for `card`, `list`, `single` and `ui`;
- a search definition when search is enabled.

The canonical contract is `src/core/modules/module-contract.ts`. `src/core/modules/module-registry.ts` is the registration point and `src/core/modules/bootstrap.ts` performs deterministic bootstrap.

A module cannot enable a capability without a provider and cannot declare a search definition while disabling search.

## Presentation grammar

Every module follows the same presentation vocabulary:

```text
module/components/
  cards/
  lists/
  single/
  ui/
```

The components remain domain-specific. Shared design-system primitives remain under Atomic's existing `atoms`, `molecules` and `organisms` hierarchy.

A module may expose variants such as `default`, `compact`, `featured`, `horizontal`, `dense` or `search`. Variants change presentation, not domain behavior. Styling comes from Atomic design tokens instead of module-specific visual frameworks.

Do not create `UniversalCard<T>` or another generic semantic component. Shared abstractions belong at the UI primitive level; domain components own domain semantics.

## CMS capabilities

The current CMS capability catalogue defines:

```text
content
localization
media
seo
taxonomy
attributes
search
publication
revisions
locks
engagement
moderation
notifications
audit
cache
```

A capability identifies a reusable responsibility. The catalogue points to the authoritative Atomic implementation(s). It is not a reason to copy that implementation into each module.

## Admin Resource model

Administrable modules expose an `AdminResourceDefinition` with:

- management capabilities: list, search, filters, sort, pagination, stats;
- action capabilities: create, read, update, duplicate, publish, unpublish, archive, restore, delete and optional bulk operations;
- typed filters and sort definitions;
- presentation variants;
- the resource's RBAC namespace.

The compatibility validator rejects impossible combinations such as filters without listing, or publication actions on a module without publication capability.

The shared admin surface is built around resource management rather than module-specific CRUD pages. Blog and Services are the first real consumers.

## URL state

Admin list search/filter/sort/pagination state is represented by query parameters. This preserves SSR determinism, back/forward navigation, bookmarking and shareable state.

## Localization and RTL

Modules own localized domain content and localized SEO where appropriate. The admin framework owns locale-state behavior and must not silently discard dirty form state when switching locale.

`fr`, `en`, `es` and `ar` are supported by the current platform. RTL is a property of shared shells and UI primitives rather than a Blog- or Services-specific implementation.

## Shared versus transactional domains

The CMS owns editorial concerns:

```text
content
localization
media
taxonomy
SEO
publication/workflow
revisions
locks
search indexing
admin CRUD
permissions
moderation hooks
audit
cache
```

Future transactional domains consume the CMS but remain separate:

```text
pricing
orders
payments
inventory
booking
availability engines
enrollment
shipping
```

This prevents Shop, Courses or Services from turning the CMS into an ERP.

## Module examples

### Blog

The Blog is the first complete editorial module. It uses the shared CMS infrastructure and retains its native domain schema, loaders, Actions, ContentEditor integration, media, taxonomy, SEO, engagement, moderation, notifications, revisions and locks.

### Services

Services is the second validation module. It demonstrates that the same module and admin contracts support a domain with typed pricing, duration, capacity, availability, provider identity, ratings, localized content and extensible attributes without creating a parallel CMS.

## Forbidden patterns

Do not add:

- a universal polymorphic content table for all modules;
- module-specific copies of Media, Audit, Search, Workflow, Revision or Cache engines;
- parallel REST admin APIs when Astro Actions already own the mutation boundary;
- JSONB maps as the primary localization model;
- `any` or `Record<string, unknown>` as domain mutation contracts;
- module styles that bypass the Atomic design system.

## Adding a new module

A new module should:

1. define its domain schema and invariants;
2. implement typed validation and Actions/loaders;
3. declare its CMS capabilities and providers;
4. define its presentation grammar;
5. define its Admin Resource contract;
6. use shared Media, ContentEditor, Search, SEO, Localization, Workflow, Revision, Lock, Moderation, Notification, Audit and Cache infrastructure where applicable;
7. provide public and admin routes, including organization-scoped routes where the domain supports tenancy;
8. add unit, integration and E2E coverage appropriate to its invariants;
9. update documentation.

The test for the abstraction is reuse: a new module should require domain-specific code, not another copy of the CMS.