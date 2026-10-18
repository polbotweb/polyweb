// Demo users — reused by the blog seed (author / reader / critic / org admin).
// Password is the same for all demo accounts: DemoBlog1234!
// Hash format follows better-auth default (scrypt): s:<hash>:<salt>
// emailVerified=true so they can sign in immediately in demo/staging.
export default [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Claire Martin",
    email: "annecy-author-demo@atomic.local",
    emailVerified: true,
    role: "user",
    createdAt: new Date("2026-01-02T09:00:00.000Z"),
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Leo Walker",
    email: "annecy-reader-demo@atomic.local",
    emailVerified: true,
    role: "user",
    createdAt: new Date("2026-01-02T09:05:00.000Z"),
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    name: "Sofia Reyes",
    email: "annecy-critic-demo@atomic.local",
    emailVerified: true,
    role: "user",
    createdAt: new Date("2026-01-02T09:10:00.000Z"),
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    name: "Marc Dubois",
    email: "annecy-org-admin-demo@atomic.local",
    emailVerified: true,
    role: "user",
    createdAt: new Date("2026-01-02T09:15:00.000Z"),
  },
];
