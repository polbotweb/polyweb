# Atomic CMS — Implementation Matrix

This document is the canonical implementation map for the current CMS foundation and its two reference modules.

## Implemented reference modules

| Area | Blog | Services | Shared foundation |
| --- | --- | --- | --- |
| Module contract | ✅ | ✅ | `src/core/modules/` |
| Capability binding | ✅ | ✅ | `src/core/capabilities/` |
| Presentation grammar | ✅ | ✅ | `src/core/presentation/` |
| Card / list / single / UI | ✅ | ✅ | module presentation contracts + Atomic design system |
| Admin Resource | ✅ | ✅ | `src/core/admin/` |
| Search / filter / sort state | ✅ | ✅ | shared contracts + module definitions |
| Localization | ✅ | ✅ | shared i18n + domain translations |
| RTL | ✅ | ✅ | shared layout/UI behavior |
| Media | shared Media | shared Media | `mediaFiles` / MediaPicker |
| ContentEditor | ✅ | ✅ | shared Content infrastructure |
| SEO | ✅ | ✅ | shared contract + domain metadata |
| Taxonomy | ✅ | ✅ | explicit domain relations + shared acyclicity invariant |
| Publication workflow | ✅ | ✅ | shared workflow contract + domain state machine |
| Revisions | ✅ | ✅ | shared revision boundary |
| Locks | ✅ | ✅ | shared lock boundary |
| Engagement | ✅ | ✅ | explicit domain targets |
| Moderation | ✅ | ✅ | explicit domain targets |
| Notifications | ✅ | ✅ | semantic target relationships |
| Audit | ✅ | ✅ | shared audit boundary |
| Cache | ✅ | ✅ | targeted invalidation |

## Merged implementation baseline

The current `main` baseline contains the complete CMS foundation and both reference modules described by this matrix. The implementation sequence is:

```text
CMS/Admin Foundation
        ↓
Blog first-class module
        ↓
Services second first-class module
```

The merged baseline is intentionally **implementation-complete at the architecture/module level** while runtime proof remains the maintainer validation gate described in `TODO.md`. No separate “architecture-only” branch is required to consume these contracts.

## Physical module convention

A first-class business module lives under:

```text
src/modules/<module>/
├── admin/
├── actions/
├── components/
│   ├── cards/
│   ├── lists/
│   ├── single/
│   └── ui/
├── domain/
├── i18n/
├── loaders/
├── permissions/
├── schema/
├── search/
├── seo/
├── utils/
├── validation/
├── capabilities.ts
├── module.ts
└── workflow.ts
```

The convention describes ownership and responsibility. It does not require duplicating shared infrastructure.

## Administration surfaces

For tenant-aware modules, the same resource definition is used for both global and organization administration:

```text
Global
  /{lang}/admin/<module>
  /{lang}/admin/<module>/new
  /{lang}/admin/<module>/{id}/edit

Organization
  /{lang}/organizations/{slug}/admin/<module>
  /{lang}/organizations/{slug}/admin/<module>/new
  /{lang}/organizations/{slug}/admin/<module>/{id}/edit
```

The organization slug selects tenant context only. Authentication, RBAC and ownership checks remain server-side.

## Blog reference module

Blog is the first complete editorial reference. It covers:

```text
posts
translations
categories / tags
authors via canonical User identity
publication lifecycle
revisions / locks
galleries / shared media
internal links
SEO
comments / reviews / reports
reactions / favorites
moderation / notifications
view analytics
newsletter
```

Its presentation grammar is implemented under `src/modules/blog/components/{cards,lists,single,ui}` and its admin uses the shared resource model.

## Services reference module

Services is the second complete module and the architectural proof that the CMS is reusable beyond publishing articles. It adds:

```text
provider identity
price / currency
duration
capacity
mobile service
recurring availability
service taxonomy
ratings / reviews
configurable attributes
```

without introducing a second CMS, media system, workflow engine, search engine, revision system, notification engine or audit system.

Services also exercises the same public and organization-scoped routes, admin resource model, presentation grammar, i18n and tenant boundaries as Blog.

## Shared versus domain-specific ownership

Shared platform/CMS responsibilities:

```text
authentication / RBAC / tenancy / rate limiting
audit / notifications
content editing / rendering / sanitization
media ownership / lifecycle
localization conventions
SEO contracts
search contracts
taxonomy invariants
workflow contracts
revision contracts
lock contracts
moderation contracts
cache invalidation boundaries
admin resource contracts
presentation grammar
```

Domain modules own:

```text
schema semantics
business invariants
public/admin loaders
validation
Actions
resource definitions
domain presentation
module-specific UX
```

Transactional systems remain separate:

```text
orders
payments
inventory
booking
enrollment
shipping
```

## Design-system rule

Module components use Atomic's existing design-system primitives. Presentation variants are token-driven and change representation only. They must not create module-specific design systems or generic semantic components such as `UniversalCard<T>`.

## Data-model rule

Translations remain relational and typed per locale. Domain relationships remain explicit. Dynamic attributes are opt-in for genuinely dynamic properties and do not replace strongly typed core fields.

Avoid polymorphic `entityType/entityId` storage when explicit domain relations are the appropriate model.

## Quality gate before another module

Before adding Formations, Courses, Shop or Events, verify that the new module can reuse:

```text
Admin Resource
ContentEditor / sanitization
Media / MediaPicker
localization / RTL behavior
SEO contracts
Search contracts
workflow / lifecycle boundary
revision / lock boundaries
taxonomy invariants
engagement / moderation / notification hooks
audit / cache boundaries
cards / lists / single / ui grammar
```

The architectural test is reuse: a third module should add domain semantics, not another copy of Atomic CMS.

## Validation boundary

This matrix documents the implemented architecture and ownership boundaries. Runtime proof remains the repository's typecheck, lint, unit/integration tests, E2E suite and production build.
