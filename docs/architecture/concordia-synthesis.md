# Concordia → Atomic synthesis

This document records the product patterns intentionally retained from Concordia and the architectural decisions used to implement them in Atomic.

| Concordia pattern | Atomic decision | Concrete destination |
| --- | --- | --- |
| `cards / lists / single / ui` module grammar | Keep as a semantic module convention, not a copied codebase | `src/modules/*/components/{cards,lists,single,ui}` |
| Rich service cards | Domain projections using Atomic Card/Image/Badge/Price/Rating/Meta primitives | Blog + Services module UI |
| Responsive resource administration | Shared resource shell and responsive data-view patterns | `src/core/admin`, existing Admin organisms |
| Admin filters/search/sort | Typed resource definitions and URL/SSR state | `src/core/admin`, module admin contracts |
| Media picker workflow | Reuse shared Media and MediaPicker | `src/core/media` + `@atoms/media-picker` |
| Upload validation/lifecycle | Keep ownership, validation and cleanup centralized in Atomic Media | existing Media services |
| Multilingual editor | Shared localization/content workflow with relational locale rows | `src/core/localization`, ContentEditor |
| Automatic slug then manual override | Shared editorial form behavior | content/admin conventions |
| Admin feedback/toasts | Shared accessible feedback primitives | Admin Core / design system |
| Unsaved-change protection | Shared dirty-form guard | Admin Core |
| Reviews/comments/reactions/reports | Shared engagement/moderation capabilities with module semantics | `src/core/engagement`, `src/core/moderation` |
| Notifications | Shared notification capability with module-emitted events | `src/core/notifications` |
| Audit trail | Shared audit service | `src/core/audit` / platform audit implementation |
| Taxonomy | Explicit domain relations + shared hierarchy invariants | `src/core/taxonomy` |
| Search facets | Typed search adapters | `src/core/search` |
| Domain metadata | Module-specific projections on shared UI primitives | Blog + Services UI |
| Visual variants | Semantic/token-driven variants, not copied `retro/modern/futuristic` styles | module presentation contracts |

## What Atomic deliberately rejects

- Blog-specific REST mutation endpoints.
- `Record<string, unknown>` as the domain mutation contract.
- `any`-heavy module APIs.
- JSONB as the primary localization model.
- Dedicated Blog/Services media storage systems.
- A second author identity model for Blog.
- A universal polymorphic content table.
- Parallel workflow, revision, notification, audit or search engines per module.
- Hard-coded visual themes in domain components.

## Current proof modules

Atomic now contains two first-class modules using the same platform:

```text
src/modules/blog/
src/modules/services/
```

Both use explicit domain boundaries, the shared CMS capability catalog, the `card/list/single/ui` presentation grammar and the shared Admin Resource model. Services exists specifically as the second architectural validation module: it proves that the CMS platform can support a materially different business domain without cloning Blog infrastructure.

## Future module rule

A new module should be able to consume shared media, localization, SEO, workflow, revisions, locks, moderation, notifications, search and admin without creating a second implementation of those capabilities.

A module may introduce domain-specific concepts where the domain genuinely requires them. Service availability is service-specific; Shop inventory and orders, or Course enrollment and progress, are domain/transactional concerns rather than CMS primitives.

## Architectural principle

Concordia supplies a useful product grammar: coherent resources, presentation variants, responsive administration and polished editorial workflows.

Atomic supplies the system architecture: explicit domain entities, typed Actions, tenant isolation, relational localization, transactional invariants, shared infrastructure and deterministic module boundaries.

The target is the combination of those strengths without copying either project's accidental complexity.