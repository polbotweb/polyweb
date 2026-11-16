/**
 * Formulaires d'administration des petites annonces (POST + 303, sans JavaScript).
 */
import { Effect } from "effect";
import { LOCALES, type Locale } from "@i18n/config";
import { runAppResult } from "@/lib/effect/http";
import { completeLocales } from "@/core/attributes";
import { createDefinition, deleteDefinition, updateDefinition, type AttributeDefinitionDraft } from "@/core/attributes";
import { CLASSIFIED_VISIBILITIES, type ClassifiedVisibility } from "../domain/workflow";
import { ATTRIBUTE_OWNER } from "../domain/rules";
import { isAttributeKind } from "@/core/attributes";
import { approveAd, rejectAd, archiveAd } from "../services/ad.service";
import { updateCategoryTranslations, reassignAndRemoveCategory } from "../services/categories";
import { updateSiteSettings } from "../services/settings";
import { classifiedsCan, classifiedRateLimit, type ClassifiedViewer, type Scope } from "../services/access";
import { fail } from "@/lib/effect/failure";

export type FormOutcome = { readonly ok: true; readonly notice: string } | { readonly ok: false; readonly error: string };

const text = (form: FormData, name: string, max: number) => String(form.get(name) ?? "").slice(0, max);
const oneOf = <T extends string>(values: readonly T[], raw: unknown): T | null => (values.includes(raw as T) ? (raw as T) : null);

const outcome = async <A>(effect: Effect.Effect<A, unknown, never>, notice: string): Promise<FormOutcome> => {
  const result = await runAppResult(effect);
  if (result.ok) return { ok: true, notice };
  const code = (result.error as { _tag?: string; code?: string })._tag === "ActionFailure" ? (result.error as { code: string }).code : "default";
  return { ok: false, error: code };
};

const guard = (viewer: ClassifiedViewer, scope: Scope, action: "configure" | "moderate") =>
  Effect.gen(function* () {
    if (!viewer) return yield* fail("UNAUTHORIZED", "Vous devez être connecté pour effectuer cette action.");
    const ok = yield* classifiedsCan(viewer, scope, [action]);
    if (!ok) return yield* fail("NOT_FOUND", "Élément introuvable.");
    yield* classifiedRateLimit(viewer.id, "admin");
    return viewer;
  });

const localeBag = (form: FormData, prefix: string) => {
  const names = {} as Record<Locale, { name: string; description?: string }>;
  for (const locale of LOCALES) {
    names[locale] = { name: text(form, `${prefix}_${locale}_name`, 120), description: text(form, `${prefix}_${locale}_description`, 500) || undefined };
  }
  return names;
};

const labelsFrom = (form: FormData, prefix: string) =>
  completeLocales({
    fr: text(form, `${prefix}_fr`, 120),
    en: text(form, `${prefix}_en`, 120),
    es: text(form, `${prefix}_es`, 120),
    ar: text(form, `${prefix}_ar`, 120),
  });

export const handleAdminClassifiedsForm = (form: FormData, input: { viewer: ClassifiedViewer; scope: Scope }) => {
  const intent = String(form.get("intent") ?? "");
  const { viewer, scope } = input;
  switch (intent) {
    case "settings": {
      const visibility = oneOf(CLASSIFIED_VISIBILITIES, form.get("visibility"));
      if (!visibility) return Promise.resolve({ ok: false, error: "BAD_REQUEST" } as const);
      const patch = {
        visibility: visibility as ClassifiedVisibility,
        preModeration: form.get("preModeration") === "on" || form.get("preModeration") === "1",
        durationDays: Number(form.get("durationDays") ?? 30),
        defaultCurrency: text(form, "defaultCurrency", 3) || "EUR",
        maxImages: Number(form.get("maxImages") ?? 8),
        maxRenewals: Number(form.get("maxRenewals") ?? 3),
      };
      return outcome(guard(viewer, scope, "configure").pipe(Effect.flatMap((actor) => updateSiteSettings(scope, actor.id, patch))), "saved");
    }
    case "categoryUpdate": {
      const categoryId = text(form, "categoryId", 64);
      const translations = localeBag(form, "cat");
      return outcome(guard(viewer, scope, "configure").pipe(Effect.flatMap((actor) => updateCategoryTranslations(scope, actor.id, categoryId, translations))), "saved");
    }
    case "categoryDelete": {
      const categoryId = text(form, "categoryId", 64);
      const moveTo = text(form, "moveTo", 64);
      return outcome(guard(viewer, scope, "configure").pipe(Effect.flatMap((actor) => reassignAndRemoveCategory(scope, actor.id, categoryId, moveTo))), "deleted");
    }
    case "attributeCreate":
    case "attributeUpdate": {
      const kindRaw = text(form, "kind", 16);
      if (!isAttributeKind(kindRaw)) return Promise.resolve({ ok: false, error: "BAD_REQUEST" } as const);
      const optionKeys = text(form, "optionKeys", 2000).split("\n").map((s) => s.trim()).filter(Boolean);
      const rawOptions = optionKeys.length ? optionKeys.map((key, i) => ({ key, labels: completeLocales({ fr: key, en: key, es: key, ar: key }), position: i })) : undefined;
      const options = rawOptions?.map((option) => ({
        ...option,
        labels: completeLocales({
          fr: text(form, `option_${option.key}_fr`, 120) || option.labels.fr,
          en: text(form, `option_${option.key}_en`, 120) || option.labels.en,
          es: text(form, `option_${option.key}_es`, 120) || option.labels.es,
          ar: text(form, `option_${option.key}_ar`, 120) || option.labels.ar,
        }),
      }));
      const draft: AttributeDefinitionDraft = {
        module: "classifieds", ownerType: ATTRIBUTE_OWNER, ownerId: text(form, "categoryId", 64),
        key: text(form, "key", 64), kind: kindRaw, required: form.get("required") === "on", filterable: form.get("filterable") !== "0",
        unit: text(form, "unit", 24) || null,
        minValue: text(form, "minValue", 16) ? Number(form.get("minValue")) : null,
        maxValue: text(form, "maxValue", 16) ? Number(form.get("maxValue")) : null,
        position: Number(form.get("position") ?? 0),
        labels: labelsFrom(form, "label"),
        options,
      };
      if (intent === "attributeCreate") {
        return outcome(guard(viewer, scope, "configure").pipe(Effect.flatMap(() => createDefinition(draft))), "saved");
      }
      const id = text(form, "definitionId", 64);
      return outcome(guard(viewer, scope, "configure").pipe(Effect.flatMap(() => updateDefinition(id, draft))), "saved");
    }
    case "attributeDelete": {
      const id = text(form, "definitionId", 64);
      return outcome(guard(viewer, scope, "configure").pipe(Effect.flatMap(() => deleteDefinition(id, "classifieds"))), "deleted");
    }
    case "approve": return outcome(guard(viewer, scope, "moderate").pipe(Effect.flatMap((actor) => approveAd(text(form, "adId", 64), actor))), "approved");
    case "reject": return outcome(guard(viewer, scope, "moderate").pipe(Effect.flatMap((actor) => rejectAd(text(form, "adId", 64), actor))), "rejected");
    case "archive": return outcome(guard(viewer, scope, "moderate").pipe(Effect.flatMap((actor) => archiveAd(text(form, "adId", 64), actor))), "archived");
    default: return Promise.resolve({ ok: false, error: "BAD_REQUEST" } as const);
  }
};
