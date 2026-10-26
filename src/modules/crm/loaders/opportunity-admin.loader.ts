/**
 * Liste back-office des opportunités (core/filters) : filtres lus dans l'URL canonique,
 * conditions SQL partagées par la liste, le total et les facettes, toujours dans le tenant.
 * Synthèse du pipeline (montants ouverts, prévision pondérée, gagné, taux) par devise.
 */
import { and, asc, count, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { computeFacets, parseListUrlState } from "@/core/filters";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { opportunityAdminResource } from "../admin/resource";
import { CRM_STAGES, type CrmStage } from "../domain/workflow";
import { summarizePipeline } from "../domain/opportunity";
import { crm, crmCompanies } from "../schema";

export interface CrmAdminFilters {
  readonly search?: string;
  readonly status?: CrmStage;
}

export function crmAdminFiltersFromUrl(params: URLSearchParams | string): CrmAdminFilters {
  const { filters } = parseListUrlState(opportunityAdminResource.list!, params);
  return {
    search: typeof filters.search === "string" ? filters.search : undefined,
    status: CRM_STAGES.find((stage) => stage === filters.status),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c);
const inTenant = (organizationId: string | null) => (organizationId === null ? isNull(crm.organizationId) : eq(crm.organizationId, organizationId));

export function crmAdminConditions(organizationId: string | null, filters: CrmAdminFilters): SQL[] {
  const conditions: SQL[] = [inTenant(organizationId)];
  if (filters.search) {
    const pattern = "%" + escapeLike(filters.search) + "%";
    conditions.push(or(ilike(crm.title, pattern), ilike(crmCompanies.name, pattern))!);
  }
  if (filters.status) conditions.push(eq(crm.status, filters.status));
  return conditions;
}

export const crmAdminFacets = (organizationId: string | null, filters: CrmAdminFilters) =>
  computeFacets(filters, [
    {
      id: "status",
      filterKey: "status",
      count: async (without) => {
        const rows = await getDrizzle()
          .select({ value: crm.status, count: count() })
          .from(crm)
          .leftJoin(crmCompanies, eq(crmCompanies.id, crm.companyId))
          .where(and(...crmAdminConditions(organizationId, without)))
          .groupBy(crm.status);
        return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
      },
    },
  ]);

export type CrmAdminRow = typeof crm.$inferSelect & { readonly companyName: string | null };

export const crmAdminList = (organizationId: string | null, params: URLSearchParams, pageSize = 50) => {
  const state = parseListUrlState(opportunityAdminResource.list!, params);
  const filters = crmAdminFiltersFromUrl(params);
  const page = Math.max(1, state.page ?? 1);
  const direction = state.sort?.direction === "asc" ? asc : desc;
  const order =
    state.sort?.id === "amount" ? [direction(crm.amountMinor), desc(crm.createdAt)]
      : state.sort?.id === "expectedCloseDate" ? [direction(crm.expectedCloseDate), desc(crm.createdAt)]
        : [direction(crm.createdAt)];
  const where = and(...crmAdminConditions(organizationId, filters));
  return dbTry("crm.adminList", async () => {
    const db = getDrizzle();
    const [rows, [total]] = await Promise.all([
      db.select({ opportunity: crm, companyName: crmCompanies.name }).from(crm).leftJoin(crmCompanies, eq(crmCompanies.id, crm.companyId))
        .where(where).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ value: count() }).from(crm).leftJoin(crmCompanies, eq(crmCompanies.id, crm.companyId)).where(where),
    ]);
    const items: CrmAdminRow[] = rows.map((row) => ({ ...row.opportunity, companyName: row.companyName }));
    const totalItems = Number(total?.value ?? 0);
    return { items, page, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)), total: totalItems, filters };
  });
};

/** Synthèse du pipeline du tenant (toutes étapes, par devise). */
export const crmPipelineSummary = (organizationId: string | null) =>
  dbTry("crm.pipelineSummary", () =>
    getDrizzle().select({ stage: crm.status, amountMinor: crm.amountMinor, currency: crm.currency, probability: crm.probability }).from(crm).where(inTenant(organizationId)),
  ).pipe(Effect.map((rows) => summarizePipeline(rows)));

export const loadCrmAdminFacets = (organizationId: string | null, filters: CrmAdminFilters) => runOrThrow(crmAdminFacets(organizationId, filters));
export const loadCrmPipelineSummary = (organizationId: string | null) => runOrThrow(crmPipelineSummary(organizationId));
