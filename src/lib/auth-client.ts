import { createAuthClient } from "better-auth/client";
import { usernameClient, adminClient, organizationClient, twoFactorClient, emailOTPClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
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
    twoFactorClient({
      // Le formulaire de connexion affiche l'étape TOTP (voir SignInAlternatives.astro).
      onTwoFactorRedirect: ({ twoFactorMethods }) => {
        document.dispatchEvent(new CustomEvent("polyweb:two-factor-required", { detail: { methods: twoFactorMethods ?? ["totp"] } }));
      },
    }),
    emailOTPClient(),
    passkeyClient(),
  ],
});
