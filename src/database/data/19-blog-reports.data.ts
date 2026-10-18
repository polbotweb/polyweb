// Blog reports — one pending report (comment target) + one pending (review
// target) to populate the moderation queue. Single-target constraint enforced.
export default [
  {
    id: "g1000000-0000-0000-0000-000000000001",
    postId: null,
    commentId: "c8000000-0000-0000-0000-000000000003",
    reviewId: null,
    reporterId: "33333333-3333-3333-3333-333333333333",
    reason: "SPAM",
    description: "Demo seed: pending comment report sample for the moderation queue.",
    status: "PENDING",
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date("2026-02-05T14:30:00.000Z"),
  },
  {
    id: "g1000000-0000-0000-0000-000000000002",
    postId: null,
    commentId: null,
    reviewId: "d9000000-0000-0000-0000-000000000004",
    reporterId: "33333333-3333-3333-3333-333333333333",
    reason: "OFF_TOPIC",
    description: "Demo seed: pending review report sample for the moderation queue.",
    status: "PENDING",
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date("2026-02-11T11:30:00.000Z"),
  },
];
