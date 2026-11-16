/**
 * Cycle de vie des annonces : création, publication, renouvellement, attributs, médias.
 */
import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { mediaFiles } from "@database/schemas/media.schema";
import { recordEvent } from "@/core/events/outbox";
import { listDefinitions, replaceValues, validateAttributeValues, type AttributeValueInput, type LoadedDefinition } from "@/core/attributes";
import { renderMarkdown } from "@/core/content/markdown";
import { fromDecimal, parseCurrency, type CurrencyCode } from "@/core/money";
import { ActionFailure, fail } from "@/lib/effect/failure";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { classifiedAdMedia, classifiedAds } from "../schema";
import { ATTRIBUTE_OWNER, ATTRIBUTE_RESOURCE, BODY_MAX, BODY_MIN, CITY_MAX, MAX_IMAGES, MIN_IMAGES_OFFER, POSTAL_MAX, TITLE_MAX, TITLE_MIN, canRenew, expiresAtFrom, slugifyAd, submitLifecycle } from "../domain/rules";
import { canTransition, type ClassifiedCondition, type ClassifiedKind, type ClassifiedLifecycle, type ClassifiedPriceKind } from "../domain/workflow";
import { CLASSIFIEDS_AD_APPROVED_EVENT, CLASSIFIEDS_AD_EXPIRED_EVENT, CLASSIFIEDS_AD_PUBLISHED_EVENT, CLASSIFIEDS_AD_REJECTED_EVENT } from "../domain/events";
import { classifiedsAudit } from "./audit";
import { ancestryIds, assertLeafCategory } from "./categories";
import { adAccess, boardAccess, classifiedRateLimit, notFound, requireUser, type ClassifiedViewer } from "./access";

const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export interface AdInput {
  readonly categoryId: string;
  readonly title: string;
  readonly body: string;
  readonly kind: ClassifiedKind;
  readonly condition: ClassifiedCondition;
  readonly priceKind: ClassifiedPriceKind;
  readonly price?: string | null;
  readonly currency?: string | null;
  readonly city: string;
  readonly postalCode?: string | null;
  readonly country?: string | null;
  readonly media: readonly { mediaId: string; altText: string }[];
  readonly attributes: readonly AttributeValueInput[];
  readonly submit?: boolean;
}

const clean = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);

const asBadRequest = (message: string) => new ActionFailure({ code: "BAD_REQUEST", message });

const validateCore = (input: AdInput) =>
  Effect.gen(function* () {
    const title = clean(input.title, TITLE_MAX);
    const body = input.body.trim().slice(0, BODY_MAX);
    const city = clean(input.city, CITY_MAX);
    if (title.length < TITLE_MIN) return yield* fail("BAD_REQUEST", "Le titre est trop court.");
    if (body.length < BODY_MIN) return yield* fail("BAD_REQUEST", "La description est trop courte.");
    if (!city) return yield* fail("BAD_REQUEST", "La ville est obligatoire.");
    const postalCode = input.postalCode?.trim().slice(0, POSTAL_MAX) || null;
    const country = input.country?.trim().toUpperCase().slice(0, 2) || null;
    let priceMinor: number | null = null;
    let currency: string | null = null;
    if (input.priceKind === "fixed") {
      const raw = (input.price ?? "").trim();
      if (!raw) return yield* fail("BAD_REQUEST", "Le prix est obligatoire.");
      const code = yield* parseCurrency(input.currency ?? "EUR").pipe(Effect.mapError(() => asBadRequest("Devise invalide.")));
      const money = yield* fromDecimal(raw.replace(",", "."), code as CurrencyCode).pipe(Effect.mapError(() => asBadRequest("Prix invalide.")));
      if (money.amountMinor < 0) return yield* fail("BAD_REQUEST", "Prix invalide.");
      priceMinor = money.amountMinor;
      currency = money.currency;
    }
    if (input.kind === "offer" && input.media.length < MIN_IMAGES_OFFER) return yield* fail("BAD_REQUEST", "Ajoutez au moins une photo.");
    if (input.media.length > MAX_IMAGES) return yield* fail("BAD_REQUEST", `${MAX_IMAGES} photos au maximum.`);
    const alts = input.media.map((m) => ({ mediaId: m.mediaId, altText: clean(m.altText, 200) }));
    if (alts.some((m) => !m.altText)) return yield* fail("BAD_REQUEST", "Chaque photo doit avoir un texte alternatif.");
    return { title, body, bodyHtml: renderMarkdown(body), city, postalCode, country, priceMinor, currency, media: alts };
  });

const uniqueSlug = (tx: DbTransaction, siteId: string, title: string, exceptId?: string) =>
  Effect.gen(function* () {
    const base = slugifyAd(title);
    for (let i = 0; i < 20; i++) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      const rows = yield* dbTry("classifieds.ad.slug", () =>
        tx.select({ id: classifiedAds.id }).from(classifiedAds).where(and(eq(classifiedAds.siteId, siteId), eq(classifiedAds.slug, slug))).limit(1),
      );
      if (!rows[0] || rows[0].id === exceptId) return slug;
    }
    return `${base}-${crypto.randomUUID().slice(0, 8)}`;
  });

export const loadAdDefinitions = (siteId: string, categoryId: string) =>
  ancestryIds(siteId, categoryId).pipe(Effect.flatMap((ids) => listDefinitions("classifieds", ATTRIBUTE_OWNER, ids)));

const assertMedia = (ids: readonly string[], organizationId: string | null) =>
  Effect.gen(function* () {
    if (ids.length === 0) return;
    const unique = [...new Set(ids)];
    const rows = yield* dbTry("classifieds.ad.media.check", () =>
      getDrizzle().select({ id: mediaFiles.id, mimeType: mediaFiles.mimeType, organizationId: mediaFiles.organizationId }).from(mediaFiles).where(inArray(mediaFiles.id, unique)),
    );
    if (rows.length !== unique.length) return yield* fail("BAD_REQUEST", "Média invalide.");
    if (rows.some((r) => !ALLOWED_MEDIA.has(r.mimeType))) return yield* fail("BAD_REQUEST", "Seuls les formats JPEG, PNG, WebP et AVIF sont acceptés.");
    if (organizationId && rows.some((r) => r.organizationId && r.organizationId !== organizationId)) return yield* fail("BAD_REQUEST", "Média invalide.");
  });

const persistMediaAndAttributes = (
  tx: DbTransaction,
  adId: string,
  media: readonly { mediaId: string; altText: string }[],
  definitions: readonly LoadedDefinition[],
  attributes: readonly AttributeValueInput[],
) =>
  Effect.gen(function* () {
    yield* dbTry("classifieds.ad.media.clear", () => tx.delete(classifiedAdMedia).where(eq(classifiedAdMedia.adId, adId)));
    if (media.length) {
      yield* dbTry("classifieds.ad.media.insert", () =>
        tx.insert(classifiedAdMedia).values(media.map((m, position) => ({ adId, mediaId: m.mediaId, altText: m.altText, position }))),
      );
    }
    const values = yield* validateAttributeValues(definitions, attributes).pipe(
      Effect.mapError((err) => (err._tag === "AttributeValidationError" ? asBadRequest(err.message) : err)),
    );
    yield* replaceValues(tx, ATTRIBUTE_RESOURCE, adId, values);
    return media[0]?.mediaId ?? null;
  });

const publishFields = (now: Date, durationDays: number, lifecycle: ClassifiedLifecycle) =>
  lifecycle === "published"
    ? { lifecycle, publishedAt: now, expiresAt: expiresAtFrom(now, durationDays), soldAt: null }
    : { lifecycle, publishedAt: null as Date | null, expiresAt: null as Date | null, soldAt: null as Date | null };

export const createAd = (siteId: string, viewer: ClassifiedViewer, input: AdInput) =>
  Effect.gen(function* () {
    const actor = yield* requireUser(viewer);
    yield* classifiedRateLimit(actor.id, "create");
    const board = yield* boardAccess(siteId, actor);
    const category = yield* assertLeafCategory(siteId, input.categoryId);
    const core = yield* validateCore(input);
    yield* assertMedia(core.media.map((m) => m.mediaId), board.organizationId);
    const definitions = yield* loadAdDefinitions(siteId, category.id);
    const lifecycle = input.submit ? submitLifecycle(board.settings.preModeration) : "draft";
    const now = new Date();
    return yield* dbTransaction("classifieds.ad.create", (tx) =>
      Effect.gen(function* () {
        const slug = yield* uniqueSlug(tx, siteId, core.title);
        const pub = publishFields(now, board.settings.durationDays, lifecycle);
        const [ad] = yield* dbTry("classifieds.ad.insert", () =>
          tx.insert(classifiedAds).values({
            siteId, organizationId: board.organizationId, authorId: actor.id, categoryId: category.id, slug,
            title: core.title, body: core.body, bodyHtml: core.bodyHtml, kind: input.kind, condition: input.condition,
            priceKind: input.priceKind, priceMinor: core.priceMinor, currency: core.currency, city: core.city,
            postalCode: core.postalCode, country: core.country, ...pub,
          }).returning({ id: classifiedAds.id, slug: classifiedAds.slug }),
        );
        const cover = yield* persistMediaAndAttributes(tx, ad.id, core.media, definitions, input.attributes);
        if (cover) yield* dbTry("classifieds.ad.cover", () => tx.update(classifiedAds).set({ coverImageId: cover }).where(eq(classifiedAds.id, ad.id)));
        yield* classifiedsAudit(tx, { actorId: actor.id, action: "classifieds.ad.create", resource: "classified_ads", resourceId: ad.id, organizationId: board.organizationId, siteId, metadata: { lifecycle, slug: ad.slug } });
        if (lifecycle === "published") yield* recordEvent(tx, CLASSIFIEDS_AD_PUBLISHED_EVENT, { adId: ad.id, siteId, categoryId: category.id, authorId: actor.id }, { organizationId: board.organizationId });
        return ad;
      }),
    );
  });

export const updateAd = (adId: string, viewer: ClassifiedViewer, input: AdInput) =>
  Effect.gen(function* () {
    const actor = yield* requireUser(viewer);
    yield* classifiedRateLimit(actor.id, "update");
    const access = yield* adAccess(adId, actor);
    if (!access.isAuthor && !access.manager) return yield* notFound();
    if (access.ad.lifecycle === "sold" || access.ad.lifecycle === "archived") return yield* fail("BAD_REQUEST", "Cette annonce ne peut plus être modifiée.");
    const category = yield* assertLeafCategory(access.ad.siteId, input.categoryId);
    const core = yield* validateCore(input);
    yield* assertMedia(core.media.map((m) => m.mediaId), access.organizationId);
    const definitions = yield* loadAdDefinitions(access.ad.siteId, category.id);
    return yield* dbTransaction("classifieds.ad.update", (tx) =>
      Effect.gen(function* () {
        const slug = yield* uniqueSlug(tx, access.ad.siteId, core.title, adId);
        yield* dbTry("classifieds.ad.update", () =>
          tx.update(classifiedAds).set({
            categoryId: category.id, slug, title: core.title, body: core.body, bodyHtml: core.bodyHtml, kind: input.kind, condition: input.condition,
            priceKind: input.priceKind, priceMinor: core.priceMinor, currency: core.currency, city: core.city, postalCode: core.postalCode, country: core.country,
          }).where(eq(classifiedAds.id, adId)),
        );
        const cover = yield* persistMediaAndAttributes(tx, adId, core.media, definitions, input.attributes);
        yield* dbTry("classifieds.ad.cover", () => tx.update(classifiedAds).set({ coverImageId: cover }).where(eq(classifiedAds.id, adId)));
        yield* classifiedsAudit(tx, { actorId: actor.id, action: "classifieds.ad.update", resource: "classified_ads", resourceId: adId, organizationId: access.organizationId, siteId: access.ad.siteId, metadata: { slug } });
        return { id: adId, slug };
      }),
    );
  });

export const submitAd = (adId: string, viewer: ClassifiedViewer) =>
  Effect.gen(function* () {
    const actor = yield* requireUser(viewer);
    const access = yield* adAccess(adId, actor);
    if (!access.isAuthor && !access.manager) return yield* notFound();
    const next = submitLifecycle(access.settings.preModeration);
    if (access.ad.lifecycle !== "draft" && access.ad.lifecycle !== "pending") return yield* fail("BAD_REQUEST", "Cette annonce ne peut pas être soumise.");
    if (!canTransition(access.ad.lifecycle, next) && access.ad.lifecycle !== next) return yield* fail("BAD_REQUEST", "Transition interdite.");
    const now = new Date();
    const pub = publishFields(now, access.settings.durationDays, next);
    yield* dbTransaction("classifieds.ad.submit", (tx) =>
      Effect.gen(function* () {
        yield* dbTry("classifieds.ad.submit", () => tx.update(classifiedAds).set(pub).where(and(eq(classifiedAds.id, adId), eq(classifiedAds.lifecycle, access.ad.lifecycle))));
        yield* classifiedsAudit(tx, { actorId: actor.id, action: "classifieds.ad.submit", resource: "classified_ads", resourceId: adId, organizationId: access.organizationId, siteId: access.ad.siteId, metadata: { lifecycle: next } });
        if (next === "published") yield* recordEvent(tx, CLASSIFIEDS_AD_PUBLISHED_EVENT, { adId, siteId: access.ad.siteId, categoryId: access.ad.categoryId, authorId: access.ad.authorId }, { organizationId: access.organizationId });
      }),
    );
    return { lifecycle: next };
  });

const transitionOwned = (
  adId: string,
  viewer: ClassifiedViewer,
  next: ClassifiedLifecycle,
  action: `classifieds.ad.${string}`,
  event?: { name: typeof CLASSIFIEDS_AD_APPROVED_EVENT | typeof CLASSIFIEDS_AD_REJECTED_EVENT | typeof CLASSIFIEDS_AD_PUBLISHED_EVENT | typeof CLASSIFIEDS_AD_EXPIRED_EVENT },
) =>
  Effect.gen(function* () {
    const actor = yield* requireUser(viewer);
    const access = yield* adAccess(adId, actor);
    if (!access.isAuthor && !access.manager) return yield* notFound();
    if (!canTransition(access.ad.lifecycle, next)) return yield* fail("BAD_REQUEST", "Transition interdite.");
    const now = new Date();
    const patch: Record<string, unknown> = { lifecycle: next };
    if (next === "published") Object.assign(patch, publishFields(now, access.settings.durationDays, "published"));
    if (next === "sold") patch.soldAt = now;
    yield* dbTransaction(`classifieds.ad.${action}`, (tx) =>
      Effect.gen(function* () {
        yield* dbTry("classifieds.ad.transition", () => tx.update(classifiedAds).set(patch as never).where(and(eq(classifiedAds.id, adId), eq(classifiedAds.lifecycle, access.ad.lifecycle))));
        yield* classifiedsAudit(tx, { actorId: actor.id, action, resource: "classified_ads", resourceId: adId, organizationId: access.organizationId, siteId: access.ad.siteId, metadata: { from: access.ad.lifecycle, to: next } });
        if (event) yield* recordEvent(tx, event.name, { adId, siteId: access.ad.siteId, authorId: access.ad.authorId }, { organizationId: access.organizationId });
        if (next === "published" && access.ad.lifecycle !== "published") {
          yield* recordEvent(tx, CLASSIFIEDS_AD_PUBLISHED_EVENT, { adId, siteId: access.ad.siteId, categoryId: access.ad.categoryId, authorId: access.ad.authorId }, { organizationId: access.organizationId });
        }
      }),
    );
    return { lifecycle: next };
  });

export const markSold = (adId: string, viewer: ClassifiedViewer) => transitionOwned(adId, viewer, "sold", "classifieds.ad.sold");
export const archiveAd = (adId: string, viewer: ClassifiedViewer) => transitionOwned(adId, viewer, "archived", "classifieds.ad.archive");
export const withdrawAd = (adId: string, viewer: ClassifiedViewer) => transitionOwned(adId, viewer, "draft", "classifieds.ad.withdraw");

export const renewAd = (adId: string, viewer: ClassifiedViewer) =>
  Effect.gen(function* () {
    const actor = yield* requireUser(viewer);
    yield* classifiedRateLimit(actor.id, "renew");
    const access = yield* adAccess(adId, actor);
    if (!access.isAuthor && !access.manager) return yield* notFound();
    if (!canRenew(access.ad.lifecycle, access.ad.renewCount, access.settings.maxRenewals)) return yield* fail("BAD_REQUEST", "Renouvellement impossible.");
    const now = new Date();
    const expiresAt = expiresAtFrom(now, access.settings.durationDays);
    if (access.ad.lifecycle === "published") {
      yield* dbTransaction("classifieds.ad.renew", (tx) =>
        Effect.gen(function* () {
          yield* dbTry("classifieds.ad.renew", () =>
            tx.update(classifiedAds).set({ expiresAt, renewCount: access.ad.renewCount + 1, renewedAt: now }).where(and(eq(classifiedAds.id, adId), eq(classifiedAds.lifecycle, "published"))),
          );
          yield* classifiedsAudit(tx, { actorId: actor.id, action: "classifieds.ad.renew", resource: "classified_ads", resourceId: adId, organizationId: access.organizationId, siteId: access.ad.siteId, metadata: { renewCount: access.ad.renewCount + 1 } });
        }),
      );
      return { lifecycle: "published" as const, expiresAt };
    }
    const result = yield* transitionOwned(adId, actor, "published", "classifieds.ad.renew");
    yield* dbTry("classifieds.ad.renew.count", () =>
      getDrizzle().update(classifiedAds).set({ renewCount: access.ad.renewCount + 1, renewedAt: now }).where(eq(classifiedAds.id, adId)),
    );
    return result;
  });

export const approveAd = (adId: string, viewer: ClassifiedViewer) =>
  Effect.gen(function* () {
    const access = yield* adAccess(adId, viewer);
    if (!access.manager) return yield* notFound();
    if (access.ad.lifecycle !== "pending") return yield* fail("BAD_REQUEST", "Cette annonce n'est pas en attente.");
    return yield* transitionOwned(adId, viewer, "published", "classifieds.ad.publish", { name: CLASSIFIEDS_AD_APPROVED_EVENT });
  });

export const rejectAd = (adId: string, viewer: ClassifiedViewer) =>
  Effect.gen(function* () {
    const access = yield* adAccess(adId, viewer);
    if (!access.manager) return yield* notFound();
    if (access.ad.lifecycle !== "pending") return yield* fail("BAD_REQUEST", "Cette annonce n'est pas en attente.");
    return yield* transitionOwned(adId, viewer, "draft", "classifieds.ad.reject", { name: CLASSIFIEDS_AD_REJECTED_EVENT });
  });
