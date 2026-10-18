import { defineAction } from "astro:actions";
import { eq, sql } from "drizzle-orm";
import { z } from "astro/zod";
import { getDrizzle } from "@database/drizzle";
import { services, serviceViewStats } from "@database/schemas";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractIp } from "@/lib/audit";
import { resolveServiceTenant, assertServiceInTenant, serviceOrganizationIdSchema } from "./_helpers";

export const recordServiceView = defineAction({
  input: z.object({
    serviceId: z.uuid(),
    organizationId: serviceOrganizationIdSchema,
    referrer: z.string().url().optional().nullable(),
    country: z.string().length(2).optional().nullable(),
  }),
  handler: async (input, context) => {
    const tenant = resolveServiceTenant(input);
    const service = await assertServiceInTenant(input.serviceId, tenant);
    if (service.status !== "PUBLISHED") return { success: false };

    const ip = extractIp(context.request.headers, context.clientAddress);
    const key = `service-view:${input.serviceId}:${ip ?? "global"}`;
    const rate = checkRateLimit(key, { window: 60, max: 30 });
    if (!rate.allowed) return { success: false };

    const now = new Date();
    const db = getDrizzle();
    await db.insert(serviceViewStats).values({
      serviceId: input.serviceId,
      viewedAt: now,
      date: now.toISOString().slice(0, 10),
      hour: now.getUTCHours(),
      referrer: input.referrer ?? context.request.headers.get("referer"),
      country: input.country ?? null,
    });
    await db
      .update(services)
      .set({ viewCount: sql`${services.viewCount} + 1` })
      .where(eq(services.id, input.serviceId));
    return { success: true };
  },
});
