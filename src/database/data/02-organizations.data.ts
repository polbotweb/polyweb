// Demo organizations — multi-tenant blog scope.
// Reused by the blog seed (org-scoped posts/categories/tags/subscribers).
export default [
  {
    id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    name: "Office de Tourisme Annecy",
    slug: "annecy-tourisme",
    logo: null,
    createdAt: new Date("2026-01-03T10:00:00.000Z"),
    metadata: JSON.stringify({ demo: true, sector: "tourism" }),
  },
  {
    id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    name: "Alpine Outdoor Club",
    slug: "alpine-outdoor",
    logo: null,
    createdAt: new Date("2026-01-03T10:30:00.000Z"),
    metadata: JSON.stringify({ demo: true, sector: "outdoor" }),
  },
];
