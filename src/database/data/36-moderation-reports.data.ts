// Signalements de démonstration (modération générique, docs/moderation.md) : un commentaire et un
// avis de blog en attente, un commentaire de service en attente, un service signalé puis traité.
// `reporterKey` : valeur fixe de démonstration (les vrais signalements portent une empreinte HMAC).
export default [
  {
    id: "g1000000-0000-0000-0000-000000000001",
    module: "blog", targetType: "comment", targetId: "c8000000-0000-0000-0000-000000000003", organizationId: null,
    reporterId: "33333333-3333-3333-3333-333333333333", reporterKey: "seed:g1000000-0000-0000-0000-000000000001",
    reason: "spam", description: "Demo seed: pending comment report sample for the moderation queue.", status: "open",
    resolvedBy: null, resolvedAt: null, createdAt: new Date("2026-02-05T14:30:00.000Z"),
  },
  {
    id: "g1000000-0000-0000-0000-000000000002",
    module: "blog", targetType: "review", targetId: "d9000000-0000-0000-0000-000000000004", organizationId: null,
    reporterId: "33333333-3333-3333-3333-333333333333", reporterKey: "seed:g1000000-0000-0000-0000-000000000002",
    reason: "off_topic", description: "Demo seed: pending review report sample for the moderation queue.", status: "open",
    resolvedBy: null, resolvedAt: null, createdAt: new Date("2026-02-11T11:30:00.000Z"),
  },
  {
    id: "9a000000-0000-0000-0000-000000000001",
    module: "services", targetType: "comment", targetId: "99000000-0000-0000-0000-000000000003", organizationId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    reporterId: "33333333-3333-3333-3333-333333333333", reporterKey: "seed:9a000000-0000-0000-0000-000000000001",
    reason: "off_topic", description: "Signalement de démonstration.", status: "open",
    resolvedBy: null, resolvedAt: null, createdAt: new Date("2026-02-21T12:00:00.000Z"),
  },
  {
    id: "9a000000-0000-0000-0000-000000000002",
    module: "services", targetType: "service", targetId: "90000000-0000-0000-0000-000000000001", organizationId: null,
    reporterId: "33333333-3333-3333-3333-333333333333", reporterKey: "seed:9a000000-0000-0000-0000-000000000002",
    reason: "other", description: "Rapport ciblant directement le service.", status: "resolved",
    resolvedBy: "44444444-4444-4444-4444-444444444444", resolvedAt: new Date("2026-02-22T12:00:00.000Z"), createdAt: new Date("2026-02-22T11:00:00.000Z"),
  },
];
