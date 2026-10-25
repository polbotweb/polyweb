import { defineAction } from "astro:actions";
import { Effect } from "effect";
import { eq, sql } from "drizzle-orm";
import { z } from "astro/zod";
import { getDrizzle } from "@database/drizzle";
import { services, serviceViewStats } from "@database/schemas";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractIp } from "@/lib/audit";
import { resolveServiceTenant, assertServiceInTenant, serviceOrganizationIdSchema } from "./_helpers";
import { actionTry, effectHandler } from "@/lib/effect/action";

export const recordServiceView = defineAction({
  input: z.object({
    serviceId: z.uuid(),
    organizationId: serviceOrganizationIdSchema,
    referrer: z.string().url().optional().nullable(),
    country: z.string().length(2).optional().nullable(),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveServiceTenant(input);
    const service = yield* actionTry("services/views.tenant", () => assertServiceInTenant(input.serviceId, tenant));
    if (service.status !== "PUBLISHED") return { success: false };

    const ip = extractIp(context.request.headers, context.clientAddress);
    const rate = checkRateLimit(`service-view:${input.serviceId}:${ip ?? "global"}`, { window: 60, max: 30 });
    if (!rate.allowed) return { success: false };

    const now = new Date();
    const db = getDrizzle();
    // Statistique horaire et compteur dénormalisé : deux écritures indépendantes, exécutées en parallèle.
    yield* Effect.all(
      [
        actionTry("services/views.insertStat", () =>
          db.insert(serviceViewStats).values({
            serviceId: input.serviceId,
            viewedAt: now,
            date: now.toISOString().slice(0, 10),
            hour: now.getUTCHours(),
            referrer: input.referrer ?? context.request.headers.get("referer"),
            country: input.country ?? null,
          }),
        ),
        actionTry("services/views.incrementCount", () =>
          db.update(services).set({ viewCount: sql`${services.viewCount} + 1` }).where(eq(services.id, input.serviceId)),
        ),
      ],
      { concurrency: 2, discard: true },
    );
    return { success: true };
  }).pipe(Effect.withSpan("action services/views.recordServiceView"))),
});
