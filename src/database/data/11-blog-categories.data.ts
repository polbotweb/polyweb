// Blog categories (global + org-scoped). IDs are stable so translations and
// post junctions can reference them. organizationId null = global admin blog.
export default [
  // ── Global categories ──
  {
    id: "a1000000-0000-0000-0000-000000000001",
    organizationId: null,
    parentId: null,
    slug: "annecy-experiences",
    icon: "mdi:map-marker-path",
    color: "#0F766E",
    sortOrder: 1,
    createdAt: new Date("2026-01-04T08:00:00.000Z"),
  },
  {
    id: "a1000000-0000-0000-0000-000000000002",
    organizationId: null,
    parentId: "a1000000-0000-0000-0000-000000000001",
    slug: "annecy-food-drink",
    icon: "mdi:food-fork-drink",
    color: "#B45309",
    sortOrder: 2,
    createdAt: new Date("2026-01-04T08:01:00.000Z"),
  },
  {
    id: "a1000000-0000-0000-0000-000000000003",
    organizationId: null,
    parentId: "a1000000-0000-0000-0000-000000000001",
    slug: "annecy-outdoor-routes",
    icon: "mdi:bike",
    color: "#1D4ED8",
    sortOrder: 3,
    createdAt: new Date("2026-01-04T08:02:00.000Z"),
  },
  // ── Org: Annecy Tourisme categories ──
  {
    id: "c3000000-0000-0000-0000-000000000001",
    organizationId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    parentId: null,
    slug: "guides",
    icon: "mdi:compass",
    color: "#0F766E",
    sortOrder: 1,
    createdAt: new Date("2026-01-04T08:10:00.000Z"),
  },
  {
    id: "c3000000-0000-0000-0000-000000000002",
    organizationId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    parentId: null,
    slug: "events",
    icon: "mdi:calendar",
    color: "#9333EA",
    sortOrder: 2,
    createdAt: new Date("2026-01-04T08:11:00.000Z"),
  },
  // ── Org: Alpine Outdoor categories ──
  {
    id: "c5000000-0000-0000-0000-000000000001",
    organizationId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    parentId: null,
    slug: "trails",
    icon: "mdi:hiking",
    color: "#15803D",
    sortOrder: 1,
    createdAt: new Date("2026-01-04T08:20:00.000Z"),
  },
];
