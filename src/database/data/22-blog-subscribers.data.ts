// Blog newsletter subscribers — global + org-scoped. status PENDING so the
// confirm/unsubscribe flows can be tested. token must be unique.
export default [
  {
    id: "fc000000-0000-0000-0000-000000000001",
    organizationId: null,
    email: "reader.global.demo@example.com",
    locale: "fr",
    token: "demo-sub-global-0001",
    status: "PENDING",
    confirmedAt: null,
    unsubscribedAt: null,
    createdAt: new Date("2026-02-03T09:00:00.000Z"),
  },
  {
    id: "fc000000-0000-0000-0000-000000000002",
    organizationId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    email: "reader.org.demo@example.com",
    locale: "en",
    token: "demo-sub-org-0002",
    status: "CONFIRMED",
    confirmedAt: new Date("2026-02-04T09:00:00.000Z"),
    unsubscribedAt: null,
    createdAt: new Date("2026-02-04T08:00:00.000Z"),
  },
];
