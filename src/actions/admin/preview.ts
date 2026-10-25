/**
 * Liens d'aperçu sécurisé des brouillons (core/preview) — action Effect.
 * - type de ressource limité au registre (`DRAFT_PREVIEW_RESOLVERS`) ;
 * - permission propre au type exigée (ex. page:update), limitation de débit ;
 * - la ressource doit exister (hors corbeille) avant toute signature ;
 * - création auditée (DRAFT_PREVIEW_LINK_CREATE) ; le jeton lui-même n'est jamais journalisé.
 */
import { Effect } from "effect";
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { AppConfigLive } from "@/lib/effect/config";
import { createDraftPreviewToken, DRAFT_PREVIEW_TTL_CHOICES, type DraftPreviewTtl } from "@/core/preview";
import { DRAFT_PREVIEW_KINDS, DRAFT_PREVIEW_RESOLVERS } from "@/lib/preview/resolvers";
import { actionRateLimit, effectHandler, fail, requireActionPermission } from "@/lib/effect/action";
import { auditAdmin } from "./_helpers";

const ttlKeys = Object.keys(DRAFT_PREVIEW_TTL_CHOICES) as [DraftPreviewTtl, ...DraftPreviewTtl[]];

export const createDraftPreviewLink = defineAction({
  input: z.object({
    kind: z.enum(DRAFT_PREVIEW_KINDS),
    id: z.string().min(1).max(64),
    ttl: z.enum(ttlKeys).default("24h"),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const resolver = DRAFT_PREVIEW_RESOLVERS.get(input.kind)!;
    const user = yield* requireActionPermission(context, resolver.permission);
    yield* actionRateLimit(user.id, "draft-preview");
    const data = yield* resolver.load(input.id, "");
    if (!data) return yield* fail("NOT_FOUND", "Ressource introuvable.");
    const locale = data.page.page.locale;
    const { token, claims } = yield* createDraftPreviewToken({ kind: input.kind, id: input.id, locale, ttlSeconds: DRAFT_PREVIEW_TTL_CHOICES[input.ttl] }).pipe(Effect.provide(AppConfigLive));
    const origin = process.env.SITE_URL || new URL(context.request.url).origin;
    auditAdmin(context, user.id, "DRAFT_PREVIEW_LINK_CREATE", { resource: input.kind, resourceId: input.id, metadata: { locale, ttl: input.ttl } });
    return { url: new URL(`/${locale}/preview/draft/${token}`, origin).toString(), expiresAt: new Date(claims.x * 1000).toISOString() };
  })),
});
