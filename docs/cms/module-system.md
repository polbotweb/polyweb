# Atomic CMS Module System

Ce document est la référence normative pour la frontière entre le socle Atomic et les modules métier. Le `README.md` n'est pas une source éditoriale : il est généré par `pnpm run readme:generate` depuis `readme-builder/`.

## Architecture

```text
src/core/
  admin/
  attributes/
  audit/
  cache/
  capabilities/
  content/
  engagement/
  localization/
  locks/
  media/
  moderation/
  modules/
  notifications/
  presentation/
  revision/
  search/
  seo/
  taxonomy/
  workflow/

src/modules/
  blog/
  services/
  formations/   (future)
  courses/      (future)
  shop/         (future)
  events/       (future)
```

## Core responsibilities

`src/core` owns concepts shared by several modules. A core may expose a contract, invariant, adapter or stable facade over an existing Atomic implementation. It must not duplicate a domain implementation merely to satisfy a directory convention.

Core capabilities include content and sanitization, media ownership and lifecycle, localization and locale state, taxonomy invariants, SEO, search contracts, publication workflow, editorial revisions and locks, engagement/moderation boundaries, notifications, audit and cache invalidation, plus reusable administrative resource primitives.

## Module responsibilities

A module owns its business meaning, domain schema, validation, permissions, actions/loaders, search adapter, SEO projection, localized copy and domain presentation.

The preferred module grammar is:

```text
module/
├── domain/
├── schema/
├── actions/
├── loaders/
├── validation/
├── permissions/
├── search/
├── seo/
├── components/
│   ├── cards/
│   ├── lists/
│   ├── single/
│   └── ui/
├── admin/
├── i18n/
└── tests/
```

The exact physical layout may adapt to existing Atomic conventions, but the responsibilities are normative.

## Presentation grammar

Every module that exposes catalogue/editorial resources should be able to define:

```text
cards
lists
single
ui
```

Variants are presentation concerns. They must not duplicate domain behavior or introduce a parallel design system. Generic visual primitives remain in the Atomic design system.

## Admin Resource grammar

Administrative resources expose typed management capabilities:

```text
list
search
filters
sort
pagination
stats
```

and explicit actions where meaningful:

```text
create
read
update
duplicate
publish
unpublish
archive
restore
delete
bulk
```

Global and organization administration use the same resource contract and domain Actions. Organization context is resolved explicitly and all referenced domain objects remain tenant-scoped.

## Mutation boundary

A state-changing operation should follow this sequence:

```text
validate
→ resolve tenant
→ authorize
→ validate referenced ownership
→ validate business invariants
→ transaction
→ revision/event/audit
→ targeted cache invalidation
```

Publication lifecycle transitions are explicit. Ordinary update operations must not silently mutate lifecycle state.

## Localization

Localized editorial data uses relational rows, normally one resource × locale. Localized slugs and SEO remain relational and unique within their tenant rules. Modules support the Atomic locale set and use the shared RTL-capable UI primitives.

## Reuse rule

A new module must consume shared capabilities instead of creating:

```text
second media system
second content editor
second search engine
second workflow engine
second notification engine
second audit engine
second admin CRUD framework
```

Domain-specific behavior stays in the module. Transactional capabilities such as payments, inventory, booking and enrollment remain outside the CMS core.

## Reference modules

`Blog` is the first complete editorial module. `Services` is the second module and serves as the architectural reuse proof for a non-blog resource. Future modules should be accepted only when they can reuse these same boundaries with minimal new infrastructure.
