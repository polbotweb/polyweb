/**
 * Actions Astro génériques de la taxonomie de catégories (core/taxonomy), Effect.
 *
 * Un module adhérent les obtient par `defineCategoryActions(taxonomy, namespace)` et les
 * ré-exporte sous `<module>.categories` : gestion des catégories et liaisons d'une ressource,
 * avec les gardes tenant-aware (`requireTenantPermission`) — administrateur global → tout,
 * propriétaire / administrateur d'organisation → SA organisation, plateforme → RBAC global.
 * La permission vérifiée est `<namespace>:update` (aucune nouvelle déclaration RBAC).
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { LOCALES } from "@i18n/config";
import { ActionFailure, effectHandler, requireTenantPermission, requireTenantResourcePermission } from "@/lib/effect/action";
import type { ConflictError, ForbiddenError } from "@/lib/effect/errors";
import type { CategoryTaxonomy } from "./categories";

const slug = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const translation = z.object({ locale: z.enum(LOCALES), name: z.string().trim().min(1).max(100), slug, description: z.string().trim().max(500).nullable().optional() });
const fields = {
  slug,
  parentId: z.uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  icon: z.string().trim().max(50).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
};

export const categoryCreateInput = z.object({ organizationId: z.string().nullable().default(null), ...fields, translations: z.array(translation).min(1).max(LOCALES.length) });
export const categoryUpdateInput = z.object({ id: z.uuid(), ...fields, slug: slug.optional(), translations: z.array(translation).max(LOCALES.length).optional() });

/** Motifs métier lisibles côté UI (le `reason` des erreurs typées devient le message de l'ActionError). */
const withReasons = <A, E>(effect: Effect.Effect<A, E | ConflictError | ForbiddenError>) =>
  effect.pipe(Effect.mapError((error) => {
    const tagged = error as { _tag?: string; reason?: string };
    if (tagged._tag === "ConflictError") return new ActionFailure({ code: "CONFLICT", message: tagged.reason ?? "Conflit." });
    if (tagged._tag === "ForbiddenError") return new ActionFailure({ code: "FORBIDDEN", message: tagged.reason ?? "Accès refusé." });
    return error as E;
  }));

export function defineCategoryActions(taxonomy: CategoryTaxonomy, namespace: string) {
  const perms = { [namespace]: ["update"] };
  return {
    list: defineAction({
      input: z.object({ organizationId: z.string().nullable().default(null), locale: z.enum(LOCALES) }),
      handler: effectHandler((input, context) => Effect.gen(function* () {
        yield* requireTenantPermission(context, perms, input.organizationId);
        return yield* taxonomy.tree(input.organizationId, input.locale);
      })),
    }),
    create: defineAction({
      input: categoryCreateInput,
      handler: effectHandler(({ organizationId, ...input }, context) => Effect.gen(function* () {
        yield* requireTenantPermission(context, perms, organizationId);
        return yield* withReasons(taxonomy.create(organizationId, input));
      })),
    }),
    update: defineAction({
      input: categoryUpdateInput,
      handler: effectHandler(({ id, ...patch }, context) => Effect.gen(function* () {
        yield* requireTenantResourcePermission(context, perms, () => taxonomy.organizationOf(id));
        return yield* withReasons(taxonomy.update(id, patch));
      })),
    }),
    remove: defineAction({
      input: z.object({ id: z.uuid() }),
      handler: effectHandler((input, context) => Effect.gen(function* () {
        yield* requireTenantResourcePermission(context, perms, () => taxonomy.organizationOf(input.id));
        yield* withReasons(taxonomy.remove(input.id));
        return { success: true };
      })),
    }),
    /** Remplace les catégories d'une ressource : garde sur l'organisation de la RESSOURCE. */
    assign: defineAction({
      input: z.object({ resourceId: z.uuid(), categoryIds: z.array(z.uuid()).max(50) }),
      handler: effectHandler((input, context) => Effect.gen(function* () {
        yield* requireTenantResourcePermission(context, perms, () => taxonomy.resourceOrganizationOf(input.resourceId));
        yield* withReasons(taxonomy.setResourceCategories(input.resourceId, input.categoryIds));
        return { success: true };
      })),
    }),
  };
}
