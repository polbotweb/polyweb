/**
 * Contrôleur SSR du tableau de bord ERP (lecture seule, GET). La page vérifie `sales:read` ;
 * la section stock exige en plus `logistics:read` (revérifié ici). Tenant plateforme (`null`).
 */
import type { AstroGlobal } from "astro";
import { Effect } from "effect";
import { runAppResult } from "@/lib/effect/http";
import { hasLogisticsPermission } from "@/modules/logistics/permissions";
import { dashboardFiltersFromUrl, lowStockThresholdFromEnv } from "../domain/period";
import { dashboardService } from "../services/dashboard.service";

/** Tenant du back-office plateforme. */
export const DASHBOARD_ORGANIZATION: string | null = null;

const todayUtc = (now: Date) => now.toISOString().slice(0, 10);

export const dashboardView = async (astro: AstroGlobal, organizationId: string | null = DASHBOARD_ORGANIZATION) => {
  const now = new Date();
  const today = todayUtc(now);
  const { filters, errors } = dashboardFiltersFromUrl(astro.url.searchParams, {
    today,
    defaultThreshold: lowStockThresholdFromEnv(process.env.DASHBOARD_LOW_STOCK_THRESHOLD),
  });
  const canSeeStock = await hasLogisticsPermission(astro, ["read"]);
  const result = await runAppResult(Effect.all({
    revenue: dashboardService.revenue(organizationId, filters),
    receivables: dashboardService.receivables(organizationId, filters.currency, today, now),
    stock: canSeeStock ? dashboardService.stock(organizationId, filters.currency, filters.lowStockThreshold, now) : Effect.succeed(null),
  }, { concurrency: 3 }));
  return { filters, errors, today, canSeeStock, data: result.ok ? result.value : null };
};

export type DashboardView = Awaited<ReturnType<typeof dashboardView>>;
