import { createAuthClient } from "better-auth/client";
import { usernameClient, adminClient, organizationClient } from "better-auth/client/plugins";
import { ac, adminRole, editorRole, userRole, orgOwnerRole, orgAdminRole, orgMemberRole } from "@/lib/permissions";

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    adminClient({
      ac,
      roles: {
        admin: adminRole,
        editor: editorRole,
        user: userRole,
      },
    }),
    organizationClient({
      ac,
      roles: {
        owner: orgOwnerRole,
        admin: orgAdminRole,
        member: orgMemberRole,
      },
      dynamicAccessControl: { enabled: true },
    }),
  ],
});
