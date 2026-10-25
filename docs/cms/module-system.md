# Polyweb CMS Module System

Ce document est la référence normative pour la frontière entre le socle Polyweb et les modules métier. Le `README.md` n'est pas une source éditoriale : il est généré par `pnpm run readme:generate` depuis `readme-builder/`.

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

`src/core` owns concepts shared by several modules. A core may expose a contract, invariant, adapter or stable facade over an existing Polyweb implementation. It must not duplicate a domain implementation merely to satisfy a directory convention.

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

The exact physical layout may adapt to existing Polyweb conventions, but the responsibilities are normative.

## Presentation grammar

Every module that exposes catalogue/editorial resources should be able to define:

```text
cards
lists
single
ui
```

Variants are presentation concerns. They must not duplicate domain behavior or introduce a parallel design system. Generic visual primitives remain in the Polyweb design system.

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

Localized editorial data uses relational rows, normally one resource × locale. Localized slugs and SEO remain relational and unique within their tenant rules. Modules support the Polyweb locale set and use the shared RTL-capable UI primitives.

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

## Scaffolding (`pnpm module:new`) and core abstractions

`pnpm module:new <domain> [--entity=<entity>] [--table=<sql_name>] [--taxonomy]` generates, in addition to the module contract, loaders, admin
resource and components, a module wired to the core Effect abstractions:

| File | Core abstraction |
| --- | --- |
| `schema/index.ts` | content table named after the **pluralized entity** (`--entity=product` → `products`; `--table` overrides), `<table>_revisions`, `<table>_locks` (lock columns expected by `core/locks`); the generator refuses a table name already declared under `src/database` or `src/modules` |
| `domain/workflow.ts` | `WorkflowDefinition` (`core/workflow`): `DRAFT` / `PUBLISHED` / `ARCHIVED` transitions |
| `locks.ts` | `defineLockResource` + `drizzleLockStore` (`core/locks`): user + session owner, same-user takeover, TTL, purge |
| `locks.ts` (`tenantOf`) | owning organization for the generic, audited `forceReleaseLock` admin action (global admins anywhere, org owners/admins in their own organization only); auto-registered via `src/modules/*/locks.ts` |
| `components/<domain>/admin/<Pascal>AdminList.astro` | `ForceReleaseLockButton` (confirm) when the page passes `canForceReleaseLock` (`canAdministerTenant`) |
| `permissions/index.ts` | tenant-aware Effect guards over `requireTenantPermission` / `requireTenantResourcePermission` (`src/lib/effect/action.ts`, `core/permissions/tenant`): `require<Pascal>Permission(context, perms, organizationId)` for create / bulk, `require<Pascal>ResourcePermission(context, perms, id)` for update / transition / lock / unlock (organization read from the row). Global admins: everything; org owners/admins: their own organization only; platform content (`organizationId = null`): global RBAC (`userHasPermission`) |
| `services/<entity>.service.ts` | Effect service: `dbTry` writes, lock check, workflow check, revision on each write |
| `loaders/<entity>.loader.ts` | Effect loader (`dbTry`) + `load<Pascal>` Promise adapter (`runOrThrow`) |
| `actions/index.ts` | Astro actions with an Effect prologue (`effectHandler`, permission guard, lock owner from session) |

The module declares `publication`, `revisions` and `locks` capabilities with their providers. Not generated on
purpose (manual steps printed by the generator): the migration (export the schema from
`src/database/schemas/index.ts`, then `pnpm db:generate`), the `<domain>` namespace in the access-control
statements, the re-export of the actions from `src/actions/index.ts`, and the page route.

### Categories (`core/taxonomy`, opt-in `--taxonomy`)

Categories are a **generic core contract** (`src/core/taxonomy/categories.ts`) that any module opts into; there is
no universal polymorphic table. Each module owns three typed tables — `<entity>_categories` (tenant, parent,
slug, sort order, icon, color), `<entity>_category_translations` (one row per locale, no JSONB) and
`<entity>_category_links` (resource ↔ category) — and declares them with `defineCategoryTaxonomy` +
`registerCategoryTaxonomy` in `src/modules/<domain>/taxonomy.ts` (one storage per resource type; duplicates throw).

The contract provides `list` / `tree` (localized, no locale fallback), `create` / `update` (slug + color
validation, cycle refusal → `ValidationError`), `remove` (refused while the category has children →
`ConflictError`), `setResourceCategories` (categories of the resource's own tenant only → `ForbiddenError`
otherwise), `categoriesOf`, `filterCondition` and `facet` (category facet for `core/filters`, counted with the
other active filters). Tenant scope is strict (`organizationId = null` is platform content; never a fallback).
`defineCategoryActions` (`src/core/taxonomy/actions.ts`) exposes the tenant-aware Astro actions
`<domain>Actions.categories.{list,create,update,remove,assign}` (global admins everywhere, org owners/admins in
their own organization, `{ <domain>: ["update"] }` permission for platform content).

| Module | Storage |
| --- | --- |
| Events, Formations, Courses, Shop | new tables (migration `0026_categories_taxonomy`, additive) |
| Blog, Services | adapters over the **existing** `blog_categories*` / `service_categor*` tables — behavior and data unchanged, no data migration |

Every admin list above exposes a "category" facet (`categoryId` query parameter, uuid only, filtered in the tenant).
`pnpm module:new <domain> --taxonomy` scaffolds the three tables, `taxonomy.ts`, the `taxonomy` capability, the
`categories` actions, the resource filter and the loader filter/condition/facet; without the flag nothing is generated.

Existing modules keep their table names (no rename): `events`, `formations` and `courses` already match their
pluralized entity; renaming the Shop tables (`shop_products` / `shop_revisions` / `shop_locks`, Drizzle const `shop`, → `products` / `product_revisions` / `product_locks`) is only a proposal
(foreign keys, lock store and migrations involved — not trivially safe).

`tests/unit/scripts/new-module.test.ts` generates a module inside the repository (ignored `tmp*` folder), runs
`tsc --noEmit` on every generated TypeScript file against the real core code, and imports `module.ts` so the
capability contract is checked at load time.

