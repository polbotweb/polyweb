// Demo user credentials (better-auth account table, credential provider).
// Password for every demo account: DemoBlog1234!
// Hash format: s:<scrypt-hash>:<salt> (better-auth default scrypt, dklen 64).
export default [
  {
    id: "a1111111-1111-1111-1111-111111111111",
    accountId: "annecy-author-demo@atomic.local",
    providerId: "credential",
    userId: "11111111-1111-1111-1111-111111111111",
    password: "s:d87bfb32cbb18998fe59a65e9d4c999c237718c00319e2d9f0835dce30b8b8e70b64e1c5614bb2de4d5ee69927e76e6c174a94860d8f666d6b07490a6f961c8d:7184dd31723e5d0611323cf2244c307e",
    createdAt: new Date("2026-01-02T09:00:00.000Z"),
  },
  {
    id: "a2222222-2222-2222-2222-222222222222",
    accountId: "annecy-reader-demo@atomic.local",
    providerId: "credential",
    userId: "22222222-2222-2222-2222-222222222222",
    password: "s:d87bfb32cbb18998fe59a65e9d4c999c237718c00319e2d9f0835dce30b8b8e70b64e1c5614bb2de4d5ee69927e76e6c174a94860d8f666d6b07490a6f961c8d:7184dd31723e5d0611323cf2244c307e",
    createdAt: new Date("2026-01-02T09:05:00.000Z"),
  },
  {
    id: "a3333333-3333-3333-3333-333333333333",
    accountId: "annecy-critic-demo@atomic.local",
    providerId: "credential",
    userId: "33333333-3333-3333-3333-333333333333",
    password: "s:d87bfb32cbb18998fe59a65e9d4c999c237718c00319e2d9f0835dce30b8b8e70b64e1c5614bb2de4d5ee69927e76e6c174a94860d8f666d6b07490a6f961c8d:7184dd31723e5d0611323cf2244c307e",
    createdAt: new Date("2026-01-02T09:10:00.000Z"),
  },
  {
    id: "a4444444-4444-4444-4444-444444444444",
    accountId: "annecy-org-admin-demo@atomic.local",
    providerId: "credential",
    userId: "44444444-4444-4444-4444-444444444444",
    password: "s:d87bfb32cbb18998fe59a65e9d4c999c237718c00319e2d9f0835dce30b8b8e70b64e1c5614bb2de4d5ee69927e76e6c174a94860d8f666d6b07490a6f961c8d:7184dd31723e5d0611323cf2244c307e",
    createdAt: new Date("2026-01-02T09:15:00.000Z"),
  },
];
