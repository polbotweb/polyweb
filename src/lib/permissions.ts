/**
 * CMS RBAC permissions — single source of truth for access control.
 *
 * TWO access-control layers:
 *   1. Global (admin plugin)  — user/session management + CMS resources
 *   2. Organization (org plugin) — org/member/invitation/team management + CMS resources
 */
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements as adminDefaultStatements, adminAc } from "better-auth/plugins/admin/access";
import { defaultStatements as orgDefaultStatements, ownerAc, adminAc as orgAdminAc, memberAc } from "better-auth/plugins/organization/access";

export const statement = {
  ...adminDefaultStatements,
  ...orgDefaultStatements,
  page: ["create", "read", "update", "delete", "publish"],
  section: ["create", "read", "update", "delete"],
  media: ["upload", "read", "delete"],
  site: ["read", "update"],
  navigation: ["read", "update"],
  audit: ["read", "export"],
  theme: ["read", "update"],
  blog: ["create", "read", "update", "delete", "publish", "moderate"],
  blogCategory: ["create", "read", "update", "delete"],
  blogTag: ["create", "read", "update", "delete"],
  blogComment: ["read", "update", "delete", "moderate"],
  blogReview: ["read", "update", "delete", "moderate"],
  service: ["create", "read", "update", "delete", "publish", "moderate"],
  serviceCategory: ["create", "read", "update", "delete"],
  serviceTag: ["create", "read", "update", "delete"],
  serviceComment: ["read", "update", "delete", "moderate"],
  serviceReview: ["read", "update", "delete", "moderate"],
  // ─── Polyweb platform bricks ───
  contentType: ["create", "read", "update", "delete"],
  contentEntry: ["create", "read", "update", "delete", "publish"],
  apiToken: ["create", "read", "revoke"],
  webhook: ["create", "read", "update", "delete"],
  form: ["create", "read", "update", "delete"],
  formSubmission: ["read", "delete", "export"],
  plugin: ["read", "update"],
  tenant: ["create", "read", "update", "delete"],
  payment: ["read", "refund"],
  shop: ["create", "read", "update", "delete", "publish"],
  tax: ["create", "read", "update", "delete", "publish"],
  courses: ["create", "read", "update", "delete", "publish"],
  formations: ["create", "read", "update", "delete", "publish"],
  events: ["create", "read", "update", "delete", "publish"],
} as const;

const platformAdmin = {
  contentType: ["create", "read", "update", "delete"],
  contentEntry: ["create", "read", "update", "delete", "publish"],
  apiToken: ["create", "read", "revoke"],
  webhook: ["create", "read", "update", "delete"],
  form: ["create", "read", "update", "delete"],
  formSubmission: ["read", "delete", "export"],
  plugin: ["read", "update"],
  tenant: ["create", "read", "update", "delete"],
  payment: ["read", "refund"],
} as const;

const platformEditor = {
  contentType: ["read"],
  contentEntry: ["create", "read", "update", "delete", "publish"],
  apiToken: [], webhook: [],
  form: ["create", "read", "update"],
  formSubmission: ["read", "export"],
  plugin: [], tenant: [], payment: [],
} as const;

const platformReadOnly = {
  contentType: ["read"], contentEntry: ["read"], apiToken: [], webhook: [], form: ["read"], formSubmission: [], plugin: [], tenant: [], payment: [],
} as const;

export const ac = createAccessControl(statement);

const cmsAdminServices = {
  service: ["create", "read", "update", "delete", "publish", "moderate"],
  serviceCategory: ["create", "read", "update", "delete"],
  serviceTag: ["create", "read", "update", "delete"],
  serviceComment: ["read", "update", "delete", "moderate"],
  serviceReview: ["read", "update", "delete", "moderate"],
} as const;

const cmsEditorServices = {
  service: ["create", "read", "update", "delete", "publish"],
  serviceCategory: ["create", "read", "update", "delete"],
  serviceTag: ["create", "read", "update", "delete"],
  serviceComment: ["read", "update", "moderate"],
  serviceReview: ["read", "update", "moderate"],
} as const;

const cmsReadOnlyServices = {
  service: ["read"],
  serviceCategory: ["read"],
  serviceTag: ["read"],
  serviceComment: ["read"],
  serviceReview: ["read"],
} as const;

/** Module events (catalogue éditorial ; inscriptions hors CMS Core). */
const cmsAdminEvents = { events: ["create", "read", "update", "delete", "publish"] } as const;
const cmsReadOnlyEvents = { events: ["read"] } as const;

/** Module formations (catalogue éditorial ; transactions hors CMS Core). */
const cmsAdminFormations = { formations: ["create", "read", "update", "delete", "publish"] } as const;
const cmsReadOnlyFormations = { formations: ["read"] } as const;

/** Module courses (catalogue éditorial ; transactions hors CMS Core). */
const cmsAdminCourses = { courses: ["create", "read", "update", "delete", "publish"] } as const;
const cmsReadOnlyCourses = { courses: ["read"] } as const;

/** Module shop (catalogue éditorial ; transactions hors CMS Core). */
const cmsAdminShop = { shop: ["create", "read", "update", "delete", "publish"] } as const;
const cmsReadOnlyShop = { shop: ["read"] } as const;
/** Module tax (taux de TVA par pays / catégorie, exports comptables). */
const cmsAdminTax = { tax: ["create", "read", "update", "delete", "publish"] } as const;
const cmsReadOnlyTax = { tax: ["read"] } as const;

export const adminRole = ac.newRole({
  ...adminAc.statements,
  page: ["create", "read", "update", "delete", "publish"],
  section: ["create", "read", "update", "delete"],
  media: ["upload", "read", "delete"],
  site: ["read", "update"],
  navigation: ["read", "update"],
  audit: ["read", "export"],
  theme: ["read", "update"],
  blog: ["create", "read", "update", "delete", "publish", "moderate"],
  blogCategory: ["create", "read", "update", "delete"],
  blogTag: ["create", "read", "update", "delete"],
  blogComment: ["read", "update", "delete", "moderate"],
  blogReview: ["read", "update", "delete", "moderate"],
  ...cmsAdminServices,
  ...platformAdmin,
  ...cmsAdminEvents,
  ...cmsAdminFormations,
  ...cmsAdminCourses,
  ...cmsAdminShop,
  ...cmsAdminTax,
});

export const editorRole = ac.newRole({
  user: [], session: [],
  page: ["create", "read", "update", "delete", "publish"],
  section: ["create", "read", "update", "delete"],
  media: ["upload", "read", "delete"],
  site: ["read"], navigation: ["read"], audit: ["read"], theme: ["read"],
  blog: ["create", "read", "update", "delete", "publish"],
  blogCategory: ["create", "read", "update", "delete"],
  blogTag: ["create", "read", "update", "delete"],
  blogComment: ["read", "update", "moderate"],
  blogReview: ["read", "update", "moderate"],
  ...cmsEditorServices,
  ...platformEditor,
  ...cmsAdminEvents,
  ...cmsAdminFormations,
  ...cmsAdminCourses,
  ...cmsAdminShop,
  ...cmsAdminTax,
});

export const userRole = ac.newRole({
  user: [], session: [],
  page: ["read"], section: ["read"], media: ["read"], site: ["read"], navigation: ["read"], theme: ["read"],
  blog: ["read"], blogCategory: ["read"], blogTag: ["read"], blogComment: ["read"], blogReview: ["read"],
  ...cmsReadOnlyServices,
  ...platformReadOnly,
  ...cmsReadOnlyEvents,
  ...cmsReadOnlyFormations,
  ...cmsReadOnlyCourses,
  ...cmsReadOnlyShop,
  ...cmsReadOnlyTax,
});

export const orgOwnerRole = ac.newRole({
  ...ownerAc.statements,
  page: ["create", "read", "update", "delete", "publish"],
  section: ["create", "read", "update", "delete"],
  media: ["upload", "read", "delete"],
  site: ["read", "update"], navigation: ["read", "update"], audit: ["read", "export"], theme: ["read", "update"],
  blog: ["create", "read", "update", "delete", "publish", "moderate"],
  blogCategory: ["create", "read", "update", "delete"], blogTag: ["create", "read", "update", "delete"],
  blogComment: ["read", "update", "delete", "moderate"], blogReview: ["read", "update", "delete", "moderate"],
  ...cmsAdminServices,
  ...platformEditor,
  ...cmsAdminEvents,
  ...cmsAdminFormations,
  ...cmsAdminCourses,
  ...cmsAdminShop,
  ...cmsAdminTax,
});

export const orgAdminRole = ac.newRole({
  ...orgAdminAc.statements,
  page: ["create", "read", "update", "delete", "publish"],
  section: ["create", "read", "update", "delete"],
  media: ["upload", "read", "delete"],
  site: ["read"], navigation: ["read", "update"], audit: ["read"], theme: ["read"],
  blog: ["create", "read", "update", "delete", "publish", "moderate"],
  blogCategory: ["create", "read", "update", "delete"], blogTag: ["create", "read", "update", "delete"],
  blogComment: ["read", "update", "delete", "moderate"], blogReview: ["read", "update", "delete", "moderate"],
  ...cmsAdminServices,
  ...platformEditor,
  ...cmsAdminEvents,
  ...cmsAdminFormations,
  ...cmsAdminCourses,
  ...cmsAdminShop,
  ...cmsAdminTax,
});

export const orgMemberRole = ac.newRole({
  ...memberAc.statements,
  page: ["read"], section: ["read"], media: ["read"], site: ["read"], navigation: ["read"], theme: ["read"],
  blog: ["read"], blogCategory: ["read"], blogTag: ["read"], blogComment: ["read"], blogReview: ["read"],
  ...cmsReadOnlyServices,
  ...platformReadOnly,
  ...cmsReadOnlyEvents,
  ...cmsReadOnlyFormations,
  ...cmsReadOnlyCourses,
  ...cmsReadOnlyShop,
  ...cmsReadOnlyTax,
});
