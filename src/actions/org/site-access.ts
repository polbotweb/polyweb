import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { auditOrg, orgRateLimitEffect } from "./_helpers";
import { effectHandler, fail, requireTenantPermission } from "@/lib/effect/action";
import { grantSiteAccess, revokeSiteAccess } from "@/core/permissions/site-access";

/**
 * Accès par site (C3-A), formulaires HTML (`accept: 'form'`, fonctionnent sans JS).
 * Garde : permission `site:update` dans l'organisation (propriétaire / administrateur ou rôle
 * dynamique) ; tout refus est journalisé par `requireTenantPermission`.
 */
const id = z.string().trim().min(1).max(128);

export const orgGrantSiteAccess = defineAction({
  accept: "form",
  input: z.object({
    organizationId: id,
    siteId: id,
    userId: id,
    role: z.string().trim().max(50).regex(/^[a-z0-9-]*$/).optional(),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireTenantPermission(context, { site: ["update"] }, input.organizationId, input.siteId);
    yield* orgRateLimitEffect(user.id, "org-site-access");
    const result = yield* grantSiteAccess({ organizationId: input.organizationId, siteId: input.siteId, userId: input.userId, role: input.role || null, createdBy: user.id });
    if (!result.ok) {
      return yield* result.reason === "not-found"
        ? fail("NOT_FOUND", "Site ou membre introuvable dans cette organisation.")
        : fail("BAD_REQUEST", result.reason === "owner" ? "Le propriétaire ne peut pas être restreint." : "Rôle invalide pour cette organisation.");
    }
    auditOrg(context, user.id, "org.site_access.grant", { resource: "site_access", resourceId: result.id, organizationId: input.organizationId, siteId: input.siteId, metadata: { userId: input.userId, role: input.role || null } });
    return { ok: true as const, id: result.id };
  })),
});

export const orgRevokeSiteAccess = defineAction({
  accept: "form",
  input: z.object({ organizationId: id, id }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireTenantPermission(context, { site: ["update"] }, input.organizationId, null);
    yield* orgRateLimitEffect(user.id, "org-site-access");
    const removed = yield* revokeSiteAccess(input.organizationId, input.id);
    if (!removed) return yield* fail("NOT_FOUND", "Accès introuvable.");
    auditOrg(context, user.id, "org.site_access.revoke", { resource: "site_access", resourceId: removed.id, organizationId: input.organizationId, siteId: removed.siteId, metadata: { userId: removed.userId } });
    return { ok: true as const };
  })),
});
