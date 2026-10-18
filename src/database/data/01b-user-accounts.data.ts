// Demo user credentials (better-auth account table, credential provider).
// Password for every demo account: DemoBlog1234!
// Hashed at seed time with the configured Better Auth hasher. Better Auth 1.7
// requires accountId === userId and issuer "local:credential" for credential accounts.
import { auth } from "@/lib/auth";

const DEMO_PASSWORD_HASH = await (await auth.$context).password.hash("DemoBlog1234!");
const CREDENTIAL_ISSUER = "local:credential";

export default [
  {
    id: "a1111111-1111-1111-1111-111111111111",
    accountId: "11111111-1111-1111-1111-111111111111",
    issuer: CREDENTIAL_ISSUER,
    providerId: "credential",
    userId: "11111111-1111-1111-1111-111111111111",
    password: DEMO_PASSWORD_HASH,
    createdAt: new Date("2026-01-02T09:00:00.000Z"),
  },
  {
    id: "a2222222-2222-2222-2222-222222222222",
    accountId: "22222222-2222-2222-2222-222222222222",
    issuer: CREDENTIAL_ISSUER,
    providerId: "credential",
    userId: "22222222-2222-2222-2222-222222222222",
    password: DEMO_PASSWORD_HASH,
    createdAt: new Date("2026-01-02T09:05:00.000Z"),
  },
  {
    id: "a3333333-3333-3333-3333-333333333333",
    accountId: "33333333-3333-3333-3333-333333333333",
    issuer: CREDENTIAL_ISSUER,
    providerId: "credential",
    userId: "33333333-3333-3333-3333-333333333333",
    password: DEMO_PASSWORD_HASH,
    createdAt: new Date("2026-01-02T09:10:00.000Z"),
  },
  {
    id: "a4444444-4444-4444-4444-444444444444",
    accountId: "44444444-4444-4444-4444-444444444444",
    issuer: CREDENTIAL_ISSUER,
    providerId: "credential",
    userId: "44444444-4444-4444-4444-444444444444",
    password: DEMO_PASSWORD_HASH,
    createdAt: new Date("2026-01-02T09:15:00.000Z"),
  },
];
