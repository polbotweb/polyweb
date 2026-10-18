// Blog comment moderations — audit trail for approved comments.
export default [
  {
    id: "cm000001-0000-0000-0000-000000000001",
    commentId: "c8000000-0000-0000-0000-000000000001",
    moderatorId: "11111111-1111-1111-1111-111111111111",
    action: "APPROVE",
    reason: "Demo seed: relevant comment.",
    previousValues: null,
    createdAt: new Date("2026-02-01T12:05:00.000Z"),
  },
  {
    id: "cm000002-0000-0000-0000-000000000002",
    commentId: "c8000000-0000-0000-0000-000000000002",
    moderatorId: "11111111-1111-1111-1111-111111111111",
    action: "APPROVE",
    reason: "Demo seed: useful reply.",
    previousValues: null,
    createdAt: new Date("2026-02-01T13:05:00.000Z"),
  },
  {
    id: "cm000003-0000-0000-0000-000000000004",
    commentId: "c8000000-0000-0000-0000-000000000004",
    moderatorId: "11111111-1111-1111-1111-111111111111",
    action: "APPROVE",
    reason: "Demo seed: accurate feedback.",
    previousValues: null,
    createdAt: new Date("2026-02-10T15:05:00.000Z"),
  },
  {
    id: "cm000004-0000-0000-0000-000000000005",
    commentId: "c8000000-0000-0000-0000-000000000005",
    moderatorId: "11111111-1111-1111-1111-111111111111",
    action: "APPROVE",
    reason: "Demo seed: positive feedback.",
    previousValues: null,
    createdAt: new Date("2026-02-12T16:05:00.000Z"),
  },
];
