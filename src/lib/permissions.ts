/**
 * CMS RBAC permissions — single source of truth for access control.
 *
 * TWO access-control layers:
 *   1. Global (admin plugin)  — user/session management + CMS resources
 *   2. Organization (org plugin) — org/member/invitation/team management + CMS resources
 *
 * Les namespaces des modules sont déclarés par chaque module (`modules/<m>/permissions/statements.ts`,
 * agrégés dans `modules/permissions.ts`) puis fusionnés ici (core `permissions/registry`).
 */
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements as adminDefaultStatements, adminAc } from "better-auth/plugins/admin/access";
import { mergeStatements, moduleGrants, type PredefinedRole } from "@/core/permissions/registry";
import { MODULE_PERMISSIONS, type ModuleStatements } from "@/modules/permissions";
import { defaultStatements as orgDefaultStatements, ownerAc, adminAc as orgAdminAc, memberAc } from "better-auth/plugins/organization/access";

const coreStatement = {
  ...adminDefaultStatements,
  ...orgDefaultStatements,
  page: ["create", "read", "update", "delete", "publish"],
  section: ["create", "read", "update", "delete"],
  media: ["upload", "read", "delete"],
  site: ["read", "update"],
  navigation: ["read", "update"],
  audit: ["read", "export"],
  theme: ["read", "update"],
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
} as const;

export const statement = mergeStatements(coreStatement, MODULE_PERMISSIONS) as typeof coreStatement & ModuleStatements;

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

/** Statements accordés par les modules à un rôle prédéfini. */
const mods = (role: PredefinedRole) => moduleGrants(MODULE_PERMISSIONS, role);

export const adminRole = ac.newRole({
  ...adminAc.statements,
  page: ["create", "read", "update", "delete", "publish"],
  section: ["create", "read", "update", "delete"],
  media: ["upload", "read", "delete"],
  site: ["read", "update"],
  navigation: ["read", "update"],
  audit: ["read", "export"],
  theme: ["read", "update"],
  ...platformAdmin,
  ...mods("admin"),
});

export const editorRole = ac.newRole({
  user: [], session: [],
  page: ["create", "read", "update", "delete", "publish"],
  section: ["create", "read", "update", "delete"],
  media: ["upload", "read", "delete"],
  site: ["read"], navigation: ["read"], audit: ["read"], theme: ["read"],
  ...platformEditor,
  ...mods("editor"),
});

export const userRole = ac.newRole({
  user: [], session: [],
  page: ["read"], section: ["read"], media: ["read"], site: ["read"], navigation: ["read"], theme: ["read"],
  ...platformReadOnly,
  ...mods("user"),
});

export const orgOwnerRole = ac.newRole({
  ...ownerAc.statements,
  page: ["create", "read", "update", "delete", "publish"],
  section: ["create", "read", "update", "delete"],
  media: ["upload", "read", "delete"],
  site: ["read", "update"], navigation: ["read", "update"], audit: ["read", "export"], theme: ["read", "update"],
  ...platformEditor,
  ...mods("orgOwner"),
});

export const orgAdminRole = ac.newRole({
  ...orgAdminAc.statements,
  page: ["create", "read", "update", "delete", "publish"],
  section: ["create", "read", "update", "delete"],
  media: ["upload", "read", "delete"],
  site: ["read"], navigation: ["read", "update"], audit: ["read"], theme: ["read"],
  ...platformEditor,
  ...mods("orgAdmin"),
});

export const orgMemberRole = ac.newRole({
  ...memberAc.statements,
  page: ["read"], section: ["read"], media: ["read"], site: ["read"], navigation: ["read"], theme: ["read"],
  ...platformReadOnly,
  ...mods("orgMember"),
});
