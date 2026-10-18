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
});

export const userRole = ac.newRole({
  user: [], session: [],
  page: ["read"], section: ["read"], media: ["read"], site: ["read"], navigation: ["read"], theme: ["read"],
  blog: ["read"], blogCategory: ["read"], blogTag: ["read"], blogComment: ["read"], blogReview: ["read"],
  ...cmsReadOnlyServices,
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
});

export const orgMemberRole = ac.newRole({
  ...memberAc.statements,
  page: ["read"], section: ["read"], media: ["read"], site: ["read"], navigation: ["read"], theme: ["read"],
  blog: ["read"], blogCategory: ["read"], blogTag: ["read"], blogComment: ["read"], blogReview: ["read"],
  ...cmsReadOnlyServices,
});
