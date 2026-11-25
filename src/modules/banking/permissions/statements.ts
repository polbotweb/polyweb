/**
 * Permissions des modules banking et accounting (registre core `permissions/registry`). Sans import
 * serveur : chargé côté client. Profils proposés (docs/banking.md) : comptable (tout sauf réglages),
 * trésorier (lecture, import, rapprochement), lecteur (lecture seule) — via les rôles personnalisés.
 */
import { defineModulePermissions } from "@/core/permissions/registry";

export const BANKING_ACTIONS = ["read", "import", "reconcile", "unreconcile", "approve", "rules", "accounts", "settings"] as const;
export const ACCOUNTING_ACTIONS = ["read", "manage"] as const;

const all = { banking: BANKING_ACTIONS, accounting: ACCOUNTING_ACTIONS } as const;

export const bankingPermissions = defineModulePermissions({
  module: "banking",
  label: "Banque",
  statements: all,
  // Module métier : administrateurs (plateforme et organisation) ; membres en lecture seule.
  grants: { admin: all, orgOwner: all, orgAdmin: all, orgMember: { banking: ["read"], accounting: ["read"] } },
});
