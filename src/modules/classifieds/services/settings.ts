import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { parseCurrency } from "@/core/money";
import { ActionFailure, fail } from "@/lib/effect/failure";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction } from "@/lib/effect/transaction";
import { classifiedSiteSettings } from "../schema";
import { DURATION_MAX, DURATION_MIN, MAX_IMAGES } from "../domain/rules";
import type { ClassifiedVisibility } from "../domain/workflow";
import { classifiedsAudit } from "./audit";
import type { Scope } from "./access";

export const updateSiteSettings = (scope: Scope, actorId: string, patch: { visibility: ClassifiedVisibility; preModeration: boolean; durationDays: number; defaultCurrency: string; maxImages: number; maxRenewals: number }) =>
  Effect.gen(function* () {
    if (patch.durationDays < DURATION_MIN || patch.durationDays > DURATION_MAX) return yield* fail("BAD_REQUEST", "Durée invalide.");
    if (patch.maxImages < 1 || patch.maxImages > MAX_IMAGES) return yield* fail("BAD_REQUEST", "Nombre de photos invalide.");
    if (patch.maxRenewals < 0 || patch.maxRenewals > 20) return yield* fail("BAD_REQUEST", "Nombre de renouvellements invalide.");
    yield* parseCurrency(patch.defaultCurrency).pipe(Effect.mapError(() => new ActionFailure({ code: "BAD_REQUEST", message: "Devise invalide." })));
    return yield* dbTransaction("classifieds.settings.update", (tx) =>
      Effect.gen(function* () {
        yield* dbTry("classifieds.settings.upsert", () =>
          tx.insert(classifiedSiteSettings).values({ siteId: scope.siteId, ...patch, updatedBy: actorId, updatedAt: new Date() }).onConflictDoUpdate({
            target: classifiedSiteSettings.siteId,
            set: { ...patch, updatedBy: actorId, updatedAt: new Date() },
          }),
        );
        yield* classifiedsAudit(tx, { actorId, action: "classifieds.settings.update", resource: "classified_site_settings", resourceId: scope.siteId, organizationId: scope.organizationId, siteId: scope.siteId, metadata: { visibility: patch.visibility, preModeration: patch.preModeration } });
        return patch;
      }),
    );
  });
