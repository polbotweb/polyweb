# Atomic Services Module

Services is the second first-class Atomic CMS module after Blog. It validates that a second domain can reuse the shared CMS/Admin foundation without creating a parallel architecture.

## Position

```text
Platform Core
├── Auth / RBAC / Tenancy
├── Audit
├── Notifications
└── Rate limiting

CMS / Content Core
├── Content / sanitization / internal links
├── Media
├── Localization
├── Taxonomy
├── SEO
├── Search
├── Workflow / publication
├── Revisions / locks
├── Engagement / moderation
└── Admin Resource UX

Modules
├── Blog
└── Services
```

Services owns its domain model and domain behavior. The platform owns shared infrastructure. Transactional domains such as booking, enrollment, payments, inventory and orders remain separate cores.

## Module boundary

Canonical entry point: `src/modules/services/index.ts`.

```text
src/modules/services/
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
└── index.ts
```

Registration is explicit through the CMS bootstrap. Services and Blog are registered as deterministic first-class modules.

## Presentation grammar

The module follows the Atomic `cards / lists / single / ui` grammar.

- `ServiceCard`: public/search result projection using shared image, price, rating and metadata primitives.
- `ServiceGrid`: collection presentation.
- `ServiceDetail`: canonical detail presentation.
- `ServiceMeta`: service-specific metadata primitive.

Semantic variants are presentation concerns. They do not duplicate domain behavior or introduce module-specific visual frameworks.

## Domain model

Strongly typed service fields cover provider, tenant, slug, lifecycle state, cover media, price in minor currency units, ISO currency, duration, maximum participants, mobile availability, featured state, view count, rating aggregate and editorial metadata.

Localized content uses one relational row per `service × locale`, with title, localized slug, excerpt, sanitized HTML, location and localized SEO/Open Graph metadata.

Optional dynamic attributes use service attribute definitions/values. Typed core fields remain relational and do not become JSONB blobs merely for extensibility.

## Lifecycle

```text
DRAFT      -> PUBLISHED | ARCHIVED | DELETED
PUBLISHED  -> DRAFT | ARCHIVED | DELETED
ARCHIVED   -> DRAFT | DELETED
DELETED    -> DRAFT
```

Ordinary updates cannot mutate lifecycle state. Explicit Actions own publish, unpublish, archive, restore and delete so transition validation, authorization, audit, revisions and cache invalidation remain enforceable.

## Duplication

`duplicateService` creates a new draft with a new identity and canonical copy slug. It copies translations, editorial metadata, categories, tags, media associations, availability and SEO data.

It resets publication state, views, rating aggregates, comments, reviews, reactions, favorites, notifications, locks and historical revision identity. A new creation revision is generated. Historical revisions are never copied as history.

## Localization and RTL

Services supports `fr`, `en`, `es` and `ar`. Locale validation uses Atomic's shared locale definition. Slugs and localized translation rows remain relationally unique under the service/tenant rules. Arabic uses the shared RTL-capable Atomic primitives.

## Tenant isolation

Every mutation resolves a tenant and checks ownership of the service and every referenced category, tag, media, translation, review, comment, report, notification and attribute resource. Global and organization-scoped services use the same domain code with an explicit organization boundary.

Cross-tenant references are rejected before mutation.

## Taxonomy

Services has explicit localized categories and tags. Categories are hierarchical and use the shared acyclicity invariant. Relations are explicit through `service_category_links` and `service_tag_links` rather than a polymorphic taxonomy table.

## Media and content

Services uses Atomic's existing shared Media infrastructure for cover, OG and attached media. Ownership is checked against the active tenant before attachment.

The shared `ContentEditor` is retained as the editor implementation. Services registers the `services` internal-link resolver so internal targets resolve to service data and canonical URLs without reusing Blog semantics.

## SEO and search

SEO combines localized translation metadata with service SEO data and one canonical score calculation. Public detail pages emit Service JSON-LD.

The Services search adapter declares searchable, filterable and sortable fields for title, slug, content, excerpt, status, provider, category, tag, mobile state, featured state, price, rating, publication date and views. The shared Search Core remains the engine.

## Public frontend

Global routes:

```text
/{lang}/services
/{lang}/services/{categorySlug}
/{lang}/services/tags/{tagSlug}
/{lang}/services/{slug}
/{lang}/services/{categorySlug}/{slug}
```

Organization routes:

```text
/{lang}/organizations/{slug}/services
/{lang}/organizations/{slug}/services/{categorySlug}
/{lang}/organizations/{slug}/services/{categorySlug}/{serviceSlug}
```

Public loaders expose published services only and always apply tenant + locale scope. Category-scoped detail routes verify that the service belongs to the requested category before rendering or canonicalizing.

## Administration

Global Admin:

```text
/{lang}/admin/services
/{lang}/admin/services/new
/{lang}/admin/services/[id]/edit
```

Organization Admin:

```text
/{lang}/organizations/{slug}/admin/services
/{lang}/organizations/{slug}/admin/services/new
/{lang}/organizations/{slug}/admin/services/[id]/edit
```

Both surfaces use the same resource contract and tenant-aware domain Actions. The organization surface does not duplicate Services business logic.

Admin capabilities:

```text
list/search/filters/sort/pagination/stats
create/read/update/duplicate/publish/unpublish/archive/restore/delete
```

Typed filters include search, status, category, tag, provider, mobile, featured, locale and sort/order. Statistics are tenant-wide aggregates rather than page-local counts.

## Service editor

The editor covers content/locales/slugs, pricing, duration/capacity/mobile state, categories/tags, media, location, SEO, publication, revisions and locks. Update payloads are typed; omitted fields are preserved; lifecycle fields are handled only by lifecycle Actions.

## Availability

Availability rules contain day of week, start/end time, timezone and optional capacity override. Runtime and database constraints reject invalid intervals, days and capacities. All mutations are tenant-scoped.

## Engagement and moderation

Services supports favorites, reactions, reviews, helpful votes, comments, reports and moderation.

Reactions are unique per `(serviceId, userId)` and changing reaction type replaces the previous type. Review moderation recalculates aggregate rating/count. Reports have exactly one target: service XOR comment XOR review, with target ownership verified against the service.

## Notifications

Service notifications cover new comments, replies, reviews, review moderation, publication and mentions. Notification target requirements are enforced by notification type. Listing and read-state changes are tenant-scoped through the referenced service.

## Analytics

View recording requires a published service, is rate-limited, records a statistics row and increments `services.viewCount` atomically. It is separate from synchronous SSR rendering.

## Audit

Service mutations use dedicated audit identities including creation, update, deletion, archive, publish, unpublish, restore, duplication, locking, taxonomy, moderation, reactions, favorites and views. Service events do not use Blog audit identities.

## Revisions and locks

Meaningful editorial changes create revisions. Revision restoration never overwrites history; it creates a new restoration revision. Locks are unique per service, session-aware and expiring. Competing editors receive an explicit conflict.

## Mutation safety

The intended mutation sequence is:

```text
validate
→ resolve tenant
→ authorize
→ validate referenced ownership
→ validate domain invariants
→ transaction
→ revision / event / audit
→ cache invalidation
```

HTML is sanitized before persistence. Referenced media, categories and tags are tenant-checked before association. Mutation contracts remain typed.

## Schema and migration

```text
src/database/schemas/services.schema.ts
src/database/schemas/services-engagement.schema.ts
src/modules/services/schema/index.ts
src/database/migrations/0006_services_module.sql
```

The Services migration is registered in the Drizzle journal.

## Tests

The implementation includes unit/contract tests for module capabilities, Admin Resource definition, validation, lifecycle, taxonomy, URLs and formatting. The intended integration surface covers tenant isolation, localized uniqueness, media ownership, reviews, reactions, notification targets, availability, attributes, revision restoration and lock conflicts. E2E coverage covers global and organization frontend/admin surfaces and the core editorial lifecycle.

## Extension rule

Services is the second module, not a second CMS. Future modules should follow the same sequence:

```text
module contract
→ domain schema
→ typed loaders/actions
→ shared CMS capabilities
→ cards / lists / single / ui
→ shared Admin Resource
→ global + organization admin when applicable
→ public routes
→ i18n
→ tests
```

Future transactional capabilities remain outside the CMS core.