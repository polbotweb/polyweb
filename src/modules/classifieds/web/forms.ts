/**
 * Formulaires HTML des pages publiques (POST + redirection 303, sans JavaScript).
 * Chaque intention appelle le même service que l'action Astro correspondante.
 */
import { Effect } from "effect";
import { runAppResult } from "@/lib/effect/http";
import type { AttributeValueInput } from "@/core/attributes";
import { CLASSIFIED_CONDITIONS, CLASSIFIED_KINDS, CLASSIFIED_PRICE_KINDS, type ClassifiedCondition, type ClassifiedKind, type ClassifiedPriceKind } from "../domain/workflow";
import type { AdInput } from "../services/ad.service";
import { archiveAd, createAd, markSold, renewAd, submitAd, updateAd, withdrawAd } from "../services/ad.service";
import { startInquiry } from "../services/inquiry";
import { deleteSavedSearch, saveSearch, setSavedSearchNotify, toggleFavorite } from "../services/engagement";
import type { ClassifiedViewer } from "../services/access";
import type { SavedSearchInput } from "../services/engagement";

export type FormOutcome = { readonly ok: true; readonly notice: string; readonly location?: string } | { readonly ok: false; readonly error: string };

const text = (form: FormData, name: string, max: number) => String(form.get(name) ?? "").slice(0, max);
const oneOf = <T extends string>(values: readonly T[], raw: unknown): T | null => (values.includes(raw as T) ? (raw as T) : null);

const outcome = async <A>(effect: Effect.Effect<A, unknown, never>, notice: string, location?: (value: A) => string): Promise<FormOutcome> => {
  const result = await runAppResult(effect);
  if (result.ok) return { ok: true, notice, location: location?.(result.value) };
  const code = (result.error as { _tag?: string; code?: string })._tag === "ActionFailure" ? (result.error as { code: string }).code : "default";
  return { ok: false, error: code };
};

const badRequest = (): FormOutcome => ({ ok: false, error: "BAD_REQUEST" });

export const parseAttributeInputs = (form: FormData): AttributeValueInput[] => {
  const ids = new Set<string>();
  for (const key of form.keys()) {
    if (key.startsWith("attr_") && !key.endsWith("[]")) ids.add(key.slice(5));
    if (key.startsWith("attr_") && key.endsWith("[]")) ids.add(key.slice(5, -2));
  }
  const out: AttributeValueInput[] = [];
  for (const id of ids) {
    const multi = form.getAll(`attr_${id}[]`).map(String).filter(Boolean);
    const raw = String(form.get(`attr_${id}`) ?? "");
    const kind = String(form.get(`attrkind_${id}`) ?? "text");
    if (kind === "multiselect") out.push({ definitionId: id, optionIds: multi });
    else if (kind === "select") out.push({ definitionId: id, optionId: raw || null });
    else if (kind === "boolean") out.push({ definitionId: id, boolean: raw === "true" || raw === "on" || raw === "1" ? true : raw === "false" ? false : null });
    else if (kind === "number" || kind === "integer") out.push({ definitionId: id, number: raw.trim() === "" ? null : Number(raw.replace(",", ".")) });
    else if (kind === "date") out.push({ definitionId: id, date: raw || null });
    else out.push({ definitionId: id, text: raw || null });
  }
  return out;
};

export const parseAdInput = (form: FormData): AdInput | null => {
  const kind = oneOf(CLASSIFIED_KINDS, form.get("kind")) ?? "offer";
  const condition = oneOf(CLASSIFIED_CONDITIONS, form.get("condition")) ?? "n_a";
  const priceKind = oneOf(CLASSIFIED_PRICE_KINDS, form.get("priceKind")) ?? "fixed";
  const mediaIds = form.getAll("mediaId").map(String).filter(Boolean);
  const media = mediaIds.map((mediaId) => ({ mediaId, altText: text(form, `alt_${mediaId}`, 200) }));
  const categoryId = text(form, "categoryId", 64);
  if (!categoryId) return null;
  return {
    categoryId, title: text(form, "title", 200), body: text(form, "body", 40_000), kind, condition, priceKind,
    price: text(form, "price", 32) || null, currency: text(form, "currency", 3) || null,
    city: text(form, "city", 120), postalCode: text(form, "postalCode", 20) || null, country: text(form, "country", 2) || null,
    media, attributes: parseAttributeInputs(form), submit: form.get("submit") === "1" || form.get("intent") === "publish",
  };
};

export const handleNewAdForm = (form: FormData, input: { siteId: string; viewer: ClassifiedViewer; adUrl: (slug: string) => string; draftUrl?: (slug: string) => string }) => {
  const parsed = parseAdInput(form);
  if (!parsed) return Promise.resolve(badRequest());
  return outcome(createAd(input.siteId, input.viewer, parsed), parsed.submit ? "published" : "draftSaved", (created) => input.adUrl(created.slug));
};

export const handleEditAdForm = (form: FormData, input: { adId: string; viewer: ClassifiedViewer; adUrl: (slug: string) => string }) => {
  const parsed = parseAdInput(form);
  if (!parsed) return Promise.resolve(badRequest());
  const intent = String(form.get("intent") ?? "save");
  if (intent === "save" || intent === "publish") {
    return outcome(updateAd(input.adId, input.viewer, parsed).pipe(
      // publication éventuellement après mise à jour
    ), "saved", (updated) => input.adUrl(updated.slug)).then(async (res) => {
      if (!res.ok || intent !== "publish") return res;
      const submitted = await outcome(submitAd(input.adId, input.viewer), "published", () => res.location ?? input.adUrl(""));
      return submitted.ok ? { ...submitted, location: res.location } : submitted;
    });
  }
  return Promise.resolve(badRequest());
};

export const handleAdActionForm = (form: FormData, input: { adId: string; viewer: ClassifiedViewer; siteId: string; after?: string }) => {
  const intent = String(form.get("intent") ?? "");
  switch (intent) {
    case "favorite": return outcome(toggleFavorite(input.adId, input.viewer), "favorited");
    case "sold": return outcome(markSold(input.adId, input.viewer), "sold");
    case "archive": return outcome(archiveAd(input.adId, input.viewer), "archived");
    case "withdraw": return outcome(withdrawAd(input.adId, input.viewer), "withdrawn");
    case "renew": return outcome(renewAd(input.adId, input.viewer), "renewed");
    case "submit": return outcome(submitAd(input.adId, input.viewer), "published");
    case "inquire": return outcome(startInquiry(input.adId, input.viewer, text(form, "body", 4000)), "inquired");
    case "saveSearch": {
      const payload: SavedSearchInput = {
        name: text(form, "name", 120) || null,
        query: text(form, "q", 200) || null,
        categoryId: text(form, "category", 64) || text(form, "categoryId", 64) || null,
        kind: oneOf(CLASSIFIED_KINDS, form.get("kind")),
        condition: oneOf(CLASSIFIED_CONDITIONS, form.get("condition")),
        city: text(form, "city", 120) || null,
        postalCode: text(form, "postal", 20) || null,
        notify: form.get("notify") !== "0",
      };
      return outcome(saveSearch(input.siteId, input.viewer, payload), "searchSaved");
    }
    default: return Promise.resolve(badRequest());
  }
};

export const handleSavedSearchForm = (form: FormData, viewer: ClassifiedViewer) => {
  const intent = String(form.get("intent") ?? "");
  const id = text(form, "id", 64);
  if (intent === "delete") return outcome(deleteSavedSearch(id, viewer), "deleted");
  if (intent === "notify") return outcome(setSavedSearchNotify(id, viewer, form.get("notify") === "1"), "saved");
  return Promise.resolve(badRequest());
};
