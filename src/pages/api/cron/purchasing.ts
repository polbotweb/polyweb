/**
 * POST /api/cron/purchasing — calcule le réassort selon les réglages de chaque tenant
 * (heure configurable). Authentifié par `CRON_SECRET`.
 */
import { Effect } from "effect";
import { apiRoute, json } from "@/lib/effect/http";
import { requireCron } from "@/lib/effect/cron";
import { getDrizzle } from "@database/drizzle";
import { purchasingSettings } from "@/modules/purchasing/schema/extended";
import { purchasingOpsService } from "@/modules/purchasing/services/ops.service";
import { purchasingSettingsService } from "@/modules/purchasing/services/settings.service";

export const prerender = false;

export const POST = apiRoute(({ request }) =>
  Effect.gen(function* () {
    yield* requireCron(request);
    const hour = new Date().getHours();
    const rows = yield* Effect.promise(() => getDrizzle().select().from(purchasingSettings));
    const tenants = new Set(rows.map((row) => row.organizationId));
    tenants.add(null);
    const results: Record<string, unknown> = {};
    for (const organizationId of tenants) {
      const { settings } = yield* purchasingSettingsService.get(organizationId);
      if (settings.reorderMode === "off") continue;
      if (settings.reorderHour !== hour) continue;
      results[organizationId ?? "platform"] = yield* purchasingOpsService.runReorder(organizationId, null);
    }
    return json({ ok: true, results }, { headers: { "cache-control": "no-store" } });
  }),
);
