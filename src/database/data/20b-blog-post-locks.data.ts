// Blog edit locks — one expired lock (past expiresAt) so the post stays
// editable in the UI (publishedScope treats expired locks as released).
export default [
  {
    id: "k1000000-0000-0000-0000-000000000001",
    postId: "e5000000-0000-0000-0000-000000000002",
    userId: "11111111-1111-1111-1111-111111111111",
    sessionId: "demo-session-lock-001",
    lockedAt: new Date("2026-02-05T08:00:00.000Z"),
    expiresAt: new Date("2026-02-05T08:15:00.000Z"),
  },
];
