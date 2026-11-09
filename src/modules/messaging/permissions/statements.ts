import { defineModulePermissions } from "@/core/permissions/registry";
const admin = { messaging: ["read", "moderate"] } as const;
const member = { messaging: ["read"] } as const;
export const messagingPermissions = defineModulePermissions({
  module: "messaging", label: "Messagerie", statements: admin,
  grants: { admin, editor: member, user: member, orgOwner: admin, orgAdmin: admin, orgMember: member },
});
