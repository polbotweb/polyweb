// Demo organization memberships — link demo users to demo orgs.
// Marc Dubois (org-admin) is owner of both demo orgs; Claire is a member.
export default [
  {
    id: "m1111111-1111-1111-1111-111111111111",
    organizationId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    userId: "44444444-4444-4444-4444-444444444444",
    role: "owner",
    createdAt: new Date("2026-01-03T10:00:00.000Z"),
  },
  {
    id: "m2222222-2222-2222-2222-222222222222",
    organizationId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    userId: "11111111-1111-1111-1111-111111111111",
    role: "member",
    createdAt: new Date("2026-01-03T10:01:00.000Z"),
  },
  {
    id: "m3333333-3333-3333-3333-333333333333",
    organizationId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    userId: "44444444-4444-4444-4444-444444444444",
    role: "owner",
    createdAt: new Date("2026-01-03T10:30:00.000Z"),
  },
  {
    id: "m4444444-4444-4444-4444-444444444444",
    organizationId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    userId: "11111111-1111-1111-1111-111111111111",
    role: "member",
    createdAt: new Date("2026-01-03T10:31:00.000Z"),
  },
];
