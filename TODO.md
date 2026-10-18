# Atomic — TODO / Roadmap

> **Purpose:** permanent, explicit checklist for the CMS platform and its reference modules.
>
> This file is intentionally concrete. It separates **implemented architecture**, **maintainer validation**, and **future module work** so that a conceptual goal cannot be mistaken for completed code and a completed feature cannot silently become a second implementation somewhere else.

## 0. Current baseline

At the current `main` baseline, Atomic has two first-class CMS reference modules:

```text
src/modules/blog/
src/modules/services/
```

and the shared CMS platform:

```text
src/core/
├── admin/
├── attributes/
├── audit/
├── cache/
├── capabilities/
├── content/
├── engagement/
├── localization/
├── locks/
├── media/
├── moderation/
├── modules/
├── notifications/
├── presentation/
├── revision/
├── search/
├── seo/
├── taxonomy/
└── workflow/
```

The reference architecture is documented in:

- `docs/architecture/cms-platform.md`
- `docs/architecture/cms-implementation.md`
- `docs/architecture/concordia-synthesis.md`
- `docs/cms/module-system.md`
- `docs/cms/admin-resources.md`
- `docs/cms/services.md`
- `docs/blog-convergence.md`

---

# 1. IMPLEMENTED: CMS FOUNDATION

The following are implementation requirements already established in the repository and must remain true.

## 1.1 Module contract

- [x] Stable module identifier.
- [x] Canonical entity identifier.
- [x] Explicit CMS capability declaration.
- [x] Explicit presentation grammar.
- [x] Deterministic registration.
- [x] Explicit bootstrap rather than filesystem auto-discovery.
- [x] Module ownership separated from shared infrastructure.

### Required future module shape

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

The exact tree may adapt to an existing Atomic convention, but responsibilities are normative.

## 1.2 Shared capability boundary

- [x] Content and sanitization boundary.
- [x] Media boundary.
- [x] Localization boundary.
- [x] SEO boundary.
- [x] Workflow/lifecycle boundary.
- [x] Taxonomy invariant boundary.
- [x] Search contract boundary.
- [x] Revision boundary.
- [x] Lock boundary.
- [x] Engagement boundary.
- [x] Moderation boundary.
- [x] Notification boundary.
- [x] Audit boundary.
- [x] Cache boundary.
- [x] Attribute boundary.
- [x] Presentation boundary.
- [x] Admin Resource boundary.

### Non-negotiable reuse rules

- [x] No module-specific media engine.
- [x] No module-specific content editor engine.
- [x] No module-specific search engine.
- [x] No module-specific workflow engine.
- [x] No module-specific revision engine.
- [x] No module-specific notification engine.
- [x] No module-specific audit engine.
- [x] No module-specific admin CRUD framework.
- [x] No polymorphic `entityType/entityId` shortcut merely for genericity.

---

# 2. IMPLEMENTED: ADMIN RESOURCE FOUNDATION

- [x] Typed Admin Resource definition.
- [x] Management capability contract.
- [x] Explicit editorial action contract.
- [x] Permission namespace.
- [x] Typed list/filter/sort definitions.
- [x] Resource/module compatibility validation.
- [x] Shared resource shell.
- [x] Shared form shell.
- [x] Responsive data view behavior.
- [x] Shared resource statistics presentation.
- [x] Global administration support.
- [x] Organization administration support.
- [x] Shared dirty-form protection.
- [x] Accessible feedback primitives.

## Admin resource capabilities

Every resource should expose only what it actually supports:

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

Do not enable a capability without an implementation behind it.

---

# 3. IMPLEMENTED: PRESENTATION GRAMMAR

Every substantial module should converge on:

```text
cards/
lists/
single/
ui/
```

## Rules

- [x] Cards are compact semantic projections.
- [x] Lists represent collections/search results.
- [x] Single represents canonical detail views.
- [x] UI contains domain metadata/interactions.
- [x] Shared design-system primitives remain domain-neutral.
- [x] Presentation variants do not duplicate domain behavior.
- [x] Variants are token-driven.
- [x] No `UniversalCard<T>` abstraction.
- [x] No hard-coded module-specific mini design systems.

Preferred variants include semantic forms such as:

```text
default
compact
featured
horizontal
dense
search
reader
```

A module may add variants only when a real presentation need exists.

---

# 4. IMPLEMENTED: BLOG REFERENCE MODULE

Blog is the first complete editorial proof module.

## Domain

- [x] Posts.
- [x] Localized post translations.
- [x] Categories.
- [x] Tags.
- [x] Explicit taxonomy relations.
- [x] Canonical User author identity.
- [x] Publication lifecycle.
- [x] Revisions.
- [x] Locks.
- [x] Galleries.
- [x] Shared Media integration.
- [x] ContentEditor integration.
- [x] Internal links.
- [x] SEO.
- [x] Comments.
- [x] Reviews.
- [x] Reactions.
- [x] Favorites.
- [x] Reports.
- [x] Moderation.
- [x] Notifications.
- [x] View analytics.
- [x] Newsletter.

## Blog admin

- [x] Global admin.
- [x] Organization admin.
- [x] Search.
- [x] Filters.
- [x] Sorting.
- [x] Pagination.
- [x] Global aggregate statistics.
- [x] Explicit lifecycle actions.
- [x] Duplicate flow.
- [x] Revision restoration.
- [x] Lock handling.
- [x] Gallery management.
- [x] Searchable internal-link target selection.
- [x] Localized UI.
- [x] Responsive behavior.

## Blog invariants

- [x] Tenant isolation.
- [x] Published rows require publication timestamps.
- [x] Explicit state transitions.
- [x] No arbitrary lifecycle mutation through ordinary update.
- [x] Historical revisions remain immutable.
- [x] Revision restoration creates a new revision.
- [x] Category hierarchy remains acyclic.
- [x] Cross-tenant category/tag/media references are rejected.
- [x] Reaction semantics are one reaction per user/post.
- [x] Notification semantics are target-consistent.

---

# 5. IMPLEMENTED: SERVICES REFERENCE MODULE

Services is the second complete CMS reference module and the architectural proof that Atomic is reusable beyond articles.

## Domain

- [x] Service entity.
- [x] Service translations.
- [x] Provider identity through canonical User.
- [x] Price in minor units.
- [x] Currency validation.
- [x] Duration.
- [x] Maximum participants.
- [x] Mobile-service flag.
- [x] Featured flag.
- [x] Availability.
- [x] Categories.
- [x] Tags.
- [x] Media associations.
- [x] SEO.
- [x] Revisions.
- [x] Locks.
- [x] Favorites.
- [x] Reactions.
- [x] Reviews.
- [x] Helpful-review votes.
- [x] Comments.
- [x] Reports.
- [x] Moderation.
- [x] Notifications.
- [x] View analytics.
- [x] Dynamic attributes.

## Services frontend

- [x] Localized FR/EN/ES/AR routes.
- [x] Global listing.
- [x] Category listing.
- [x] Tag/filter-oriented listing foundations.
- [x] Canonical service detail routes.
- [x] Organization-scoped public routes.
- [x] Category-scoped canonical URLs.
- [x] Service card.
- [x] Service list/grid.
- [x] Service detail.
- [x] Domain metadata presentation.
- [x] SEO/JSON-LD projection.
- [x] Shared Content infrastructure.
- [x] Shared Media infrastructure.
- [x] RTL-compatible UI foundation.

## Services admin

- [x] Global administration.
- [x] Organization administration.
- [x] Create.
- [x] Edit.
- [x] Duplicate.
- [x] Publish.
- [x] Unpublish.
- [x] Archive.
- [x] Restore.
- [x] Delete.
- [x] Lock/unlock.
- [x] Revisions.
- [x] Search.
- [x] Filters.
- [x] Sort.
- [x] Pagination.
- [x] Global statistics.
- [x] Taxonomy management.
- [x] Moderation surface.
- [x] Localized editor.
- [x] Responsive presentation.

## Services invariants

- [x] Tenant isolation for service.
- [x] Tenant isolation for translation.
- [x] Tenant isolation for category.
- [x] Tenant isolation for tag.
- [x] Tenant isolation for media.
- [x] Tenant isolation for attributes.
- [x] Tenant isolation for notification reads.
- [x] Explicit publication lifecycle.
- [x] Ordinary update cannot change lifecycle state.
- [x] Category hierarchy is acyclic.
- [x] Reports have exactly one target.
- [x] Comment/report/review targets belong to the same service.
- [x] Reactions are one-per-user/service with replacement semantics.
- [x] Review aggregates are recomputed from approved reviews.
- [x] View counter increments atomically.
- [x] View analytics are rate limited.
- [x] Availability intervals are validated and non-overlapping.
- [x] Dynamic attribute definitions are tenant-owned.
- [x] Dynamic attribute values belong to the correct service/definition.
- [x] Notification targets are consistent with notification type.
- [x] Revision restoration respects lifecycle rules.
- [x] Locks are session/user aware and expiring.

---

# 6. GLOBAL + ORGANIZATION ADMINISTRATION PARITY

Every tenant-aware module must maintain parity between:

```text
Global admin
Organization admin
```

## Global admin

```text
/{lang}/admin/<module>
/{lang}/admin/<module>/new
/{lang}/admin/<module>/{id}/edit
```

## Organization admin

```text
/{lang}/organizations/{slug}/admin/<module>
/{lang}/organizations/{slug}/admin/<module>/new
/{lang}/organizations/{slug}/admin/<module>/{id}/edit
```

Rules:

- [x] Same domain Actions.
- [x] Same validation.
- [x] Same resource definition.
- [x] Explicit tenant context.
- [x] Server-side authorization.
- [x] Referenced resources remain tenant-scoped.
- [x] Organization slug is routing context, never an authorization substitute.
- [x] Global and organization navigation expose the module consistently.

---

# 7. SECURITY / TENANCY GATE

Every mutation must conceptually follow:

```text
validate
→ resolve tenant
→ authorize
→ validate referenced ownership
→ validate business invariant
→ transaction
→ revision/event/audit
→ targeted cache invalidation
```

Never add a shortcut that skips the ownership check because the resource ID “should already belong” to the tenant.

Required cross-tenant rejection coverage:

- [x] service/category
- [x] service/tag
- [x] service/media
- [x] service/attribute definition
- [x] service/comment
- [x] service/review
- [x] service/report
- [x] blog/category
- [x] blog/tag
- [x] blog/media
- [x] blog/link target

---

# 8. CONTENT / MEDIA / LOCALIZATION / SEO

## Content

- [x] Shared ContentEditor.
- [x] Shared rendering boundary.
- [x] Sanitization preserved.
- [x] Module-specific internal-link resolver registration.
- [x] No Markdown migration as a replacement for existing Blog content storage.

## Media

- [x] Shared `mediaFiles`.
- [x] Shared MediaPicker.
- [x] Ownership checks.
- [x] Existing upload lifecycle remains centralized.
- [x] No `blog_media`.
- [x] No `service_media` storage engine.

> A module may have a relation table such as `service_media` or `blog_post_gallery_media`; this is a domain relation to the shared Media system, not a second storage subsystem.

## Localization

- [x] Relational resource × locale model.
- [x] Localized slugs.
- [x] Localized SEO.
- [x] FR.
- [x] EN.
- [x] ES.
- [x] AR.
- [x] Shared RTL behavior.
- [x] No primary JSONB localization model.

## SEO

- [x] Canonical domain score/calculation per module.
- [x] Relational metadata.
- [x] Canonical URLs.
- [x] JSON-LD where appropriate.
- [x] No second hidden SEO engine.

---

# 9. SEARCH

The architecture must remain PostgreSQL/SSR-oriented.

- [x] Shared Search Core contract.
- [x] Module-specific search definitions.
- [x] Explicit searchable fields.
- [x] Explicit filterable fields.
- [x] Explicit sortable fields.
- [x] URL-driven state where the surface is list/search based.
- [x] No per-module search engine.
- [x] No replacement of PostgreSQL full-text search with naive `%query%` logic.

Future cross-module search should be able to project results into each module's presentation grammar:

```text
BlogPostCard
ServiceCard
CourseCard
ProductCard
```

without making those domains one table.

---

# 10. WORKFLOW / REVISION / LOCK

## Workflow

Each module defines its own state machine using the shared workflow contract.

Blog/Services currently follow:

```text
DRAFT      → PUBLISHED | ARCHIVED | DELETED
PUBLISHED  → DRAFT | ARCHIVED | DELETED
ARCHIVED   → DRAFT | DELETED
DELETED    → DRAFT
```

- [x] Explicit transitions.
- [x] No arbitrary status patching through ordinary updates.
- [x] Authorization attached to lifecycle operations.
- [x] Audit attached to lifecycle operations.
- [x] Cache invalidation attached to lifecycle operations.

## Revisions

- [x] Append-only history.
- [x] Author preserved.
- [x] Locale preserved.
- [x] Content snapshot preserved.
- [x] Restoration creates a new revision.
- [x] Restoration does not overwrite history.
- [x] Publication permission is required when a restoration produces a published state.
- [x] Same-state content restoration is allowed only through explicit restoration semantics.

## Locks

- [x] Lock ownership.
- [x] Session awareness.
- [x] Expiration.
- [x] Conflict reporting.
- [x] Explicit release.
- [x] No silent takeover of an active lock.

---

# 11. TAXONOMY

- [x] Explicit category relations.
- [x] Explicit tag relations.
- [x] Shared acyclicity invariant.
- [x] Self-parent rejection.
- [x] Cycle detection for multi-level graphs.
- [x] Tenant-scoped parent lookup.
- [x] Tenant-safe translations.
- [x] Deletion rejects categories with children where domain semantics require it.

Do not “solve” this with a universal polymorphic taxonomy relation unless a real domain requirement emerges.

---

# 12. ATTRIBUTES

Dynamic attributes are allowed only where the domain genuinely needs configurable fields.

- [x] Attribute definitions are tenant-owned.
- [x] Attribute keys are validated.
- [x] Attribute types are explicit.
- [x] Attribute values have typed storage slots.
- [x] Value writes validate definition ownership.
- [x] Strongly typed core fields remain authoritative.
- [x] JSON is not used as a substitute for every typed column.

Future modules should prefer:

```text
strong core fields
+
optional dynamic attributes
```

rather than turning the entire schema into an amorphous key/value swamp.

---

# 13. ENGAGEMENT / MODERATION / NOTIFICATIONS

## Engagement

- [x] Favorites.
- [x] Reactions.
- [x] Reviews.
- [x] Helpful votes.
- [x] Comments.
- [x] Reports.

## Moderation

- [x] Explicit target ownership.
- [x] Moderation states.
- [x] Review aggregate recalculation.
- [x] Report resolution.
- [x] Unified conceptual moderation surface.

## Notifications

- [x] Shared notification capability.
- [x] Module-specific notification types.
- [x] Target consistency by notification type.
- [x] Recipient tenant scoping through target resource.
- [x] Actor/recipient self-notification suppression where intended.

Do not re-create:

```text
blog_notifications_engine
service_notifications_engine
course_notifications_engine
```

---

# 14. AUDIT / CACHE

## Audit

- [x] Shared audit service.
- [x] Domain-specific event names.
- [x] User/resource/resource-id context.
- [x] Metadata bounds.
- [x] Fallback handling.

## Cache

- [x] Targeted invalidation.
- [x] Module-aware invalidation.
- [x] No broad invalidation added merely because it is easier.
- [x] Public cache remains narrower than admin data.

---

# 15. ADMIN UX QUALITY GATE

The shared Admin Foundation must continue to support:

- [x] Search.
- [x] Typed filters.
- [x] Sort.
- [x] Pagination.
- [x] Responsive data views.
- [x] Stats.
- [x] Row actions.
- [x] Explicit destructive confirmation.
- [x] Disabled/pending submit behavior.
- [x] Accessible feedback.
- [x] Dirty-state protection.
- [x] Keyboard access.
- [x] Visible focus.
- [x] Semantic buttons/links.
- [x] Dialog semantics.
- [x] RTL-safe layout primitives.

Future enhancement candidates, **only when justified by a real use case**:

- [ ] Generic bulk-action execution with transactional batching and audit.
- [ ] Saved admin views.
- [ ] Faceted filter UI primitives.
- [ ] Generic drawer pattern for secondary resource editing.
- [ ] Resource-level empty/error/loading state primitives where repeated use demonstrates the need.

These are intentionally backlog items, not requirements to create unused wrappers.

---

# 16. CURRENT MAINTAINER VALIDATION GATE

These are not claims of having been executed automatically. They are the final validation operations required on the maintainer's machine/CI.

- [ ] Install dependencies with the repository's supported pnpm version.
- [ ] Ensure `package.json` and `pnpm-lock.yaml` are synchronized.
- [ ] Apply all Drizzle migrations.
- [ ] Verify the database is at the expected schema version.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm test:e2e`.
- [ ] Run accessibility validation.
- [ ] Run `pnpm build`.
- [ ] Re-run the generated README workflow if source inventory changed.
- [ ] Verify no generated-file drift remains.
- [ ] Verify all checks pass on the final `main` head being merged.

The validation gate is deliberately separate from implementation status. A green checkbox here means the command was actually executed and passed.

---

# 17. TODO: NEXT CMS PLATFORM EVOLUTION

Do not implement these merely because they are listed. Each must be justified by the next concrete module/use case.

## 17.1 Admin platform evolution

- [ ] Add generic bulk-selection state only when a module requires it.
- [ ] Add bulk action execution with permission checks, confirmation, transaction boundaries and audit.
- [ ] Add reusable filter-field primitives for multiselect/range/date/boolean.
- [ ] Add reusable saved-view state if multiple modules need it.
- [ ] Add reusable resource-level empty/loading/error components only after repeated demand.
- [ ] Make URL state contracts reusable across multiple module list pages.
- [ ] Verify navigation/back/forward state retention on every module admin list.

## 17.2 Content/editor platform evolution

- [ ] Formalize the shared slug auto-generation/manual-override behavior if it is not already centralized enough.
- [ ] Formalize locale-switch dirty-state handling for every editorial form.
- [ ] Formalize a common editor field contract without making domain forms generic monsters.
- [ ] Add shared preview infrastructure when multiple modules require preview.
- [ ] Keep link-target resolvers module-specific while sharing search/dialog UX.

## 17.3 Media platform evolution

- [ ] Promote additional upload/security invariants into shared Media only when reused by a second module.
- [ ] Ensure MIME/signature/size/name/SVG/ownership checks remain centralized.
- [ ] Ensure replacement/deletion lifecycle is transactionally safe where storage semantics require it.
- [ ] Expose a stable module-facing Media contract.

## 17.4 Localization platform evolution

- [ ] Centralize locale-state helpers where multiple admin forms duplicate behavior.
- [ ] Preserve relational localized domain data.
- [ ] Preserve FR/EN/ES/AR coverage.
- [ ] Keep RTL correctness at shared shell/primitive level.

## 17.5 Search platform evolution

- [ ] Add richer facet contracts when a third module needs them.
- [ ] Add cross-module result projections.
- [ ] Add shared URL-state parsing/serialization.
- [ ] Keep PostgreSQL full-text architecture authoritative unless a real scale requirement justifies another engine.

## 17.6 Engagement/moderation/notification evolution

- [ ] Extract a more formal cross-module event contract if multiple modules need the same event semantics.
- [ ] Unify moderation queue projection only when a third domain requires it.
- [ ] Formalize notification target typing without flattening domain semantics into a polymorphic table.

---

# 18. TODO: SERVICES FOLLOW-UP ONLY

Services is implemented as the second reference module. Remaining work here should be only genuine product requirements or defects found by validation.

- [ ] Fix any issue exposed by unit/typecheck/build/E2E validation.
- [ ] Fix any accessibility issue exposed by the accessibility suite.
- [ ] Fix any RTL issue exposed by Arabic E2E/a11y coverage.
- [ ] Fix any tenant-isolation regression exposed by integration/E2E tests.
- [ ] Add a feature only when Services has a concrete product requirement for it.
- [ ] Do not create a third parallel Services architecture.

---

# 19. TODO: FUTURE MODULES

The next modules are **not required to be coded now**. They are architectural consumers of the existing platform.

## 19.1 Formations

Expected domain-specific concepts may include:

```text
Formation
FormationTranslation
Instructor(s)
Curriculum
Modules
Lessons
Prerequisites
Level
Duration
Pricing
Enrollment
Progress
Certificate
Reviews
```

Before implementation:

- [ ] Define Formation domain semantics.
- [ ] Decide whether `Course` and `Formation` are separate bounded contexts or one domain with two presentations.
- [ ] Identify transactional Enrollment capabilities separately from CMS.
- [ ] Reuse Admin Resource.
- [ ] Reuse ContentEditor.
- [ ] Reuse Media.
- [ ] Reuse Localization.
- [ ] Reuse SEO.
- [ ] Reuse Search.
- [ ] Reuse Workflow.
- [ ] Reuse Revision/Lock.
- [ ] Reuse Moderation/Engagement where applicable.

## 19.2 Courses

Potential domain concerns:

```text
Course
Lessons
Modules
Instructor
Level
Duration
Progress
Prerequisites
Certificate
Enrollment
```

Before implementation:

- [ ] Decide the exact relationship with Formations.
- [ ] Keep enrollment/progress/transactions outside CMS Core.
- [ ] Reuse the existing presentation grammar.
- [ ] Reuse the existing Admin Resource grammar.

## 19.3 Shop

CMS/catalog concerns:

```text
Product
ProductTranslation
Category
Media
SEO
Publication
Variants
Attributes
Availability
```

Transactional concerns remain separate:

```text
Cart
Order
Payment
Inventory
Shipping
Refund
```

Before implementation:

- [ ] Define catalog boundaries.
- [ ] Define variant model.
- [ ] Define dynamic attribute usage.
- [ ] Separate catalog state from transactional inventory state.
- [ ] Reuse CMS/Admin primitives.

## 19.4 Events

Potential domain concerns:

```text
Event
EventTranslation
Venue
Date/time
Capacity
Registration
Price
Media
SEO
```

Before implementation:

- [ ] Keep registration/booking outside editorial CMS Core.
- [ ] Reuse publication, localization, media, taxonomy and Admin Resource.

---

# 20. FUTURE MODULE ACCEPTANCE TEST

A future module is not considered architecturally ready merely because its CRUD works.

It must answer:

```text
Can the module use the existing Admin Resource?
Can it use the existing ContentEditor?
Can it use shared Media?
Can it use relational localization?
Can it use shared SEO contracts?
Can it use shared Search contracts?
Can it use shared Workflow?
Can it use Revision/Lock?
Can it use Taxonomy invariants?
Can it use Moderation/Engagement/Notification hooks?
Can it use Audit and Cache?
Can it expose card/list/single/ui presentations?
Can it support global + organization administration without a second framework?
```

If the answer is “no” because a common capability is missing:

```text
improve the Core capability
```

Do **not** immediately create:

```text
ModuleXMedia
ModuleXSearch
ModuleXWorkflow
ModuleXRevision
ModuleXAdmin
```

---

# 21. ARCHITECTURAL RED LINES

Never introduce the following without an explicit architectural review:

```text
❌ generic polymorphic content table
❌ generic polymorphic taxonomy table just for convenience
❌ second media storage system
❌ second author identity system for Blog
❌ per-module search engine
❌ per-module workflow engine
❌ per-module notification engine
❌ per-module audit engine
❌ parallel REST admin API when Astro Actions already cover the domain
❌ `Record<string, unknown>` as a domain mutation contract
❌ `any` as a substitute for missing domain types
❌ JSONB localization as the authoritative domain model
❌ page-frontmatter business logic replacing Actions/loaders/domain code
❌ hard-coded design variants that duplicate design-system behavior
❌ silent tenant fallback
❌ silent lifecycle transitions
❌ mutable historical revisions
❌ silent lock takeover
```

---

# 22. CONCORDIA → ATOMIC RULE

Concordia contributes **product grammar**, not an architecture to copy.

Keep:

```text
coherent resource UX
cards/lists/single/ui
responsive admin
rich service-oriented cards
media workflow UX
localization UX
filters/search/sort ergonomics
```

Reject:

```text
parallel infrastructure
duplicate storage systems
weak/untyped mutation contracts
architecture that mixes transactional and editorial concerns
```

Atomic remains authoritative for:

```text
security
multi-tenancy
typed Actions
transactionality
relational schema
workflow invariants
revision/lock semantics
search architecture
audit
cache
shared Media
shared Content
```

---

# 23. DEFINITION OF “DONE” FOR THE CURRENT CMS MILESTONE

The milestone is complete from an implementation perspective when:

```text
[x] CMS Core boundaries exist.
[x] Module contract exists.
[x] Admin Resource contract exists.
[x] Card/List/Single/UI grammar exists.
[x] Blog is a first-class module.
[x] Services is a second first-class module.
[x] Global admin exists for both.
[x] Organization admin exists for both.
[x] Public frontend exists for both.
[x] Localization exists for both.
[x] Media is shared.
[x] ContentEditor is shared.
[x] Search is shared/contract-driven.
[x] Workflow is explicit.
[x] Revisions are append-only.
[x] Locks are explicit.
[x] Taxonomy invariants are enforced.
[x] Engagement/moderation/notifications have domain-safe boundaries.
[x] Audit/cache remain shared.
[x] No duplicate CMS architecture has been introduced.
[x] Documentation states the real ownership model.
```

Runtime proof is a separate gate and becomes complete only after the maintainer executes and passes the validation commands listed above.

---

# 24. RULE FOR MAINTAINERS AND FUTURE AGENTS

Before changing a CMS/module file:

1. Identify whether the concern is **Core**, **module**, **transactional**, or **presentation**.
2. Check whether the capability already exists.
3. Reuse the existing implementation if it is correct.
4. Extract a shared contract only when at least two real consumers justify it.
5. Do not create an abstraction merely because another project has one.
6. Preserve tenant/RBAC invariants.
7. Preserve relational localization.
8. Keep lifecycle explicit.
9. Keep historical state immutable.
10. Add or update tests with every new invariant.
11. Keep the README generated from source files.
12. Update this TODO only when the implementation state actually changes.

The purpose of this file is not to make the repository look busy. It exists so that future work starts from the architecture we actually built rather than from a hallucinated architecture somebody inferred from a directory tree.
