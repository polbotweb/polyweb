# Atomic CMS Documentation

Atomic CMS is organized around shared platform/CMS capabilities and first-class business modules.

## Core references

- [Module & CMS foundation](./module-system.md) — module contracts, capabilities, presentation grammar, Admin Resource model, tenancy, localization, workflow boundaries and rules for future modules.
- [Admin Resource foundation](./admin-resources.md) — resource contracts, typed list/filter/sort state, global vs organization administration and shared admin interaction patterns.
- [CMS Admin](./admin.md) — existing platform administration surface for site, pages, navigation, media, theme, users and organizations.

## Module references

- [Blog](../blog.md) — first complete editorial module and its Atomic-native architecture.
- [Services](./services.md) — second complete validation module, demonstrating reuse of the same CMS/Admin foundations for a non-blog domain.

## Architectural rule

A new module adds domain behavior without creating a second CMS. It should consume the shared content, media, localization, taxonomy, SEO, search, publication, revision, lock, moderation, notification, audit and cache boundaries where applicable.

The shared Admin Resource model, `cards/lists/single/ui` presentation grammar, tenant-aware actions/loaders and typed validation are the common product vocabulary. Domain-specific semantics remain inside the module.

Future modules such as `Formations`, `Courses`, `Shop` and `Events` should be evaluated by the amount of new infrastructure they require. Reuse of the existing CMS/Admin foundation is the architectural acceptance criterion.
