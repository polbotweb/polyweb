# Atomic Admin Resource Foundation

## Purpose

Atomic's admin is a resource-management system, not a collection of unrelated module pages. The shared contracts live under `src/core/admin/` and are consumed by first-class modules.

## Resource contract

`AdminResourceDefinition` describes:

- stable resource id and owned domain entity;
- management capabilities: list, search, filters, sort, pagination and stats;
- editorial actions: create, read, update, duplicate, publish, unpublish, archive, restore and delete;
- presentation variants;
- typed filter/sort configuration;
- RBAC permission namespace.

`assertResourceCompatibility()` prevents impossible definitions, such as filters without listing, default sorts without sort support, or publication actions without the module publication capability.

The list contract additionally validates unique filter/sort/action ids and requires selection when bulk actions are declared.

## Shared UI vocabulary

Admin resources should converge on the same interaction vocabulary:

```text
ResourceShell
ResourceList
ResourceTable / DataView
ResourceFilters
ResourceSearch
ResourcePagination
ResourceActions
ResourceBulkActions
ResourceStats
ResourceTabs
ResourceDialog
ResourceDrawer
ResourceEmptyState
ResourceErrorState
ResourceLoadingState
FormShell
FormSection
FormTabs
FormFooter
DirtyGuard
Toast / live feedback
```

Only primitives that have a real consumer should exist. Existing Atomic design-system primitives (`atoms`, `molecules`, `organisms`) remain authoritative for buttons, dialogs, tabs, tables, forms, focus behavior and tokens.

## Search/filter/sort state

Resource list state belongs in the URL so SSR and navigation stay deterministic:

```text
?page=2
&search=...
&status=...
&categoryId=...
&sortBy=updatedAt
&sortOrder=desc
```

A module declares the allowed filter and sort definitions. The loader validates the incoming query state with its domain schema rather than accepting arbitrary fields.

## Global versus organization admin

A module that supports tenancy exposes the same resource contract through two admin surfaces:

```text
/{lang}/admin/<resource>
/{lang}/organizations/{slug}/admin/<resource>
```

The global surface resolves the global tenant context. The organization surface resolves the organization by slug and passes the organization id to every loader/action. The resource contract and UI are shared; only tenant context differs.

## Permissions

Rendering an action is not authorization. Every mutation verifies the permission again server-side. The resource's `permissionNamespace` maps to the domain's existing RBAC statement.

A resource may expose different actions depending on the current user. Destructive actions must require explicit confirmation, provide pending feedback, and prevent duplicate submission.

## Dirty forms and locale changes

All complex admin forms should participate in the shared dirty-state guard. Locale changes, navigation and destructive exits must not silently discard unsaved content.

The guard is a browser/navigation concern and should not duplicate domain validation.

## Responsive behavior

Admin tables must remain usable on desktop, tablet and narrow mobile layouts. Secondary columns collapse into row detail on small viewports instead of introducing a second mobile-specific data model.

Keyboard navigation, visible focus, semantic buttons, ARIA state and accessible live feedback are part of the shared admin contract.

## Module consumers

### Blog

Blog consumes the resource contract for posts and retains its unified tabs for Posts, Categories, Tags, Moderation and Stats.

### Services

Services is the second validation module and consumes the same resource/list/filter/pagination/statistics contracts. Its domain-specific filters include status, category, tag, provider, mobile, locale and service-specific sorting.

## Architectural rule

Do not solve a new module by copying an existing module's entire admin implementation. Add a domain resource definition and reuse the shared shell/interaction contracts. Domain components remain responsible for semantic content and actions.
