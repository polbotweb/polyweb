import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { assertAdmin, adminRateLimit, auditAdmin } from "./_helpers";

/**
 * Org role management actions — thin wrappers around better-auth's native
 * organization CRUD endpoints with RBAC + rate limiting + audit logging.
 *
 * All operations require global admin role (assertAdmin).
 */

export const listOrgRoles = defineAction({
  input: z.object({
    organizationId: z.string().min(1, "L'identifiant de l'organisation est requis."),
  }),
  handler: async (input, context) => {
    assertAdmin(context);

    const { auth } = await import("@/lib/auth");
    const result = await auth.api.listOrgRoles({
      headers: context.request.headers,
      query: { organizationId: input.organizationId },
    });

    return result;
  },
});

export const createOrgRole = defineAction({
  input: z.object({
    organizationId: z.string().min(1, "L'identifiant de l'organisation est requis."),
    role: z
      .string()
      .trim()
      .min(1, "Le nom du rôle est requis.")
      .max(50, "Le nom du rôle ne peut pas dépasser 50 caractères.")
      .regex(/^[a-z0-9-]+$/, "Le nom du rôle ne peut contenir que des lettres minuscules, chiffres et tirets."),
    permission: z.record(z.string(), z.array(z.string())),
  }),
  handler: async (input, context) => {
    const user = assertAdmin(context);
    adminRateLimit(context, user.id, "org-roles");

    const { auth } = await import("@/lib/auth");

    try {
      const result = await auth.api.createOrgRole({
        body: {
          role: input.role,
          permission: input.permission,
          organizationId: input.organizationId,
        },
        headers: context.request.headers,
      });

      auditAdmin(context, user.id, "ORG_ROLE_CREATE", {
        resource: "organization_roles",
        metadata: {
          organizationId: input.organizationId,
          roleName: input.role,
        },
      });

      return result;
    } catch (err: unknown) {
      if (err instanceof ActionError) throw err;
      const msg = err instanceof Error ? err.message : "Erreur lors de la création du rôle.";
      throw new ActionError({ code: "BAD_REQUEST", message: msg });
    }
  },
});

export const updateOrgRole = defineAction({
  input: z.object({
    organizationId: z.string().min(1, "L'identifiant de l'organisation est requis."),
    roleId: z.string().optional(),
    roleName: z.string().optional(),
    data: z.object({
      roleName: z
        .string()
        .trim()
        .min(1)
        .max(50)
        .regex(/^[a-z0-9-]+$/, "Le nom du rôle ne peut contenir que des lettres minuscules, chiffres et tirets.")
        .optional(),
      permission: z.record(z.string(), z.array(z.string())).optional(),
    }),
  }).refine(
    (d) => d.roleId || d.roleName,
    "roleId ou roleName est requis.",
  ),
  handler: async (input, context) => {
    const user = assertAdmin(context);
    adminRateLimit(context, user.id, "org-roles");

    const { auth } = await import("@/lib/auth");

    try {
      const result = await auth.api.updateOrgRole({
        body: {
          roleId: input.roleId,
          roleName: input.roleName,
          organizationId: input.organizationId,
          data: input.data,
        },
        headers: context.request.headers,
      });

      auditAdmin(context, user.id, "ORG_ROLE_UPDATE", {
        resource: "organization_roles",
        metadata: {
          organizationId: input.organizationId,
          roleId: input.roleId,
          roleName: input.roleName,
        },
      });

      return result;
    } catch (err: unknown) {
      if (err instanceof ActionError) throw err;
      const msg = err instanceof Error ? err.message : "Erreur lors de la mise à jour du rôle.";
      throw new ActionError({ code: "BAD_REQUEST", message: msg });
    }
  },
});

export const deleteOrgRole = defineAction({
  input: z.object({
    organizationId: z.string().min(1, "L'identifiant de l'organisation est requis."),
    roleId: z.string().optional(),
    roleName: z.string().optional(),
  }).refine(
    (d) => d.roleId || d.roleName,
    "roleId ou roleName est requis.",
  ),
  handler: async (input, context) => {
    const user = assertAdmin(context);
    adminRateLimit(context, user.id, "org-roles");

    const { auth } = await import("@/lib/auth");

    try {
      const result = await auth.api.deleteOrgRole({
        body: {
          roleId: input.roleId,
          roleName: input.roleName,
          organizationId: input.organizationId,
        },
        headers: context.request.headers,
      });

      auditAdmin(context, user.id, "ORG_ROLE_DELETE", {
        resource: "organization_roles",
        metadata: {
          organizationId: input.organizationId,
          roleId: input.roleId,
          roleName: input.roleName,
        },
      });

      return result;
    } catch (err: unknown) {
      if (err instanceof ActionError) throw err;
      const msg = err instanceof Error ? err.message : "Erreur lors de la suppression du rôle.";
      throw new ActionError({ code: "BAD_REQUEST", message: msg });
    }
  },
});

export const updateMemberRole = defineAction({
  input: z.object({
    memberId: z.string().min(1, "L'identifiant du membre est requis."),
    role: z.union([
      z.string().min(1),
      z.array(z.string().min(1)).min(1, "Au moins un rôle est requis."),
    ]),
    organizationId: z.string().optional(),
  }),
  handler: async (input, context) => {
    const user = assertAdmin(context);
    adminRateLimit(context, user.id, "org-roles");

    const { auth } = await import("@/lib/auth");

    try {
      const result = await auth.api.updateMemberRole({
        body: {
          memberId: input.memberId,
          role: input.role,
          organizationId: input.organizationId,
        },
        headers: context.request.headers,
      });

      auditAdmin(context, user.id, "ORG_MEMBER_ROLE_UPDATE", {
        resource: "organization_members",
        metadata: {
          memberId: input.memberId,
          role: Array.isArray(input.role) ? input.role.join(",") : input.role,
        },
      });

      return result;
    } catch (err: unknown) {
      if (err instanceof ActionError) throw err;
      const msg = err instanceof Error ? err.message : "Erreur lors de la mise à jour du rôle du membre.";
      throw new ActionError({ code: "BAD_REQUEST", message: msg });
    }
  },
});
