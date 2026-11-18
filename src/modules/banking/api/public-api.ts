/**
 * API publique du module banking (registre `@/core/api`) : lecture `banking:read`
 * via `tableReader` (tenant = organisation du site de la clé, pagination par curseur).
 * À enregistrer dans `src/core/modules/bootstrap.ts` (`registerModuleApi(bankingApi)`).
 * Écritures : ajouter `writeScope`, `create` / `update` (Idempotency-Key gérée par le cœur).
 * Événements webhooks : les déclarer dans `events` et les publier via `recordEvent(tx, …)`
 * (outbox transactionnelle, `@/core/events/outbox`).
 * Ne JAMAIS importer ici un module qui dépend d'`astro:actions` (import différé sinon).
 */
import { desc } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import type { ApiResourceDefinition, ModuleApiDeclaration } from "@/core/api/contract";
import { iso, tableReader } from "@/core/api/table";
import { banking } from "../schema";

type Row = typeof banking.$inferSelect;

export const serializeBanking = (r: Row) => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  updatedAt: iso(r.updatedAt),
});

const reader = tableReader<Row, ReturnType<typeof serializeBanking>>(
  {
    name: "bank-statements",
    columns: { id: banking.id, createdAt: banking.createdAt, organizationId: banking.organizationId },
    select: (where, limit) => getDrizzle().select().from(banking).where(where).orderBy(desc(banking.createdAt), desc(banking.id)).limit(limit),
    filters: [],
  },
  serializeBanking,
);

export const bankingResource: ApiResourceDefinition<ReturnType<typeof serializeBanking>> = {
  name: "bank-statements",
  module: "banking",
  description: "Banking de l'organisation du site.",
  scope: "banking:read",
  filters: reader.filters,
  schema: {
    properties: {
      id: { type: "string" },
      slug: { type: "string" },
      title: { type: "string" },
      status: { type: "string" },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time", nullable: true },
    },
    required: ["id", "slug", "title", "status", "createdAt"],
  },
  list: reader.list,
  get: reader.get,
};

export const bankingApi: ModuleApiDeclaration = {
  module: "banking",
  resources: [bankingResource as ApiResourceDefinition<unknown>],
  events: [],
};
