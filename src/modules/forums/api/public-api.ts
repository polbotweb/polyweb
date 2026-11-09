/**
 * API publique du module forums (registre `@/core/api`) : lecture `forums:read`
 * via `tableReader` (tenant = organisation du site de la clé, pagination par curseur).
 * À enregistrer dans `src/core/modules/bootstrap.ts` (`registerModuleApi(forumsApi)`).
 * Écritures : ajouter `writeScope`, `create` / `update` (Idempotency-Key gérée par le cœur).
 * Événements webhooks : les déclarer dans `events` et les publier via `recordEvent(tx, …)`
 * (outbox transactionnelle, `@/core/events/outbox`).
 * Ne JAMAIS importer ici un module qui dépend d'`astro:actions` (import différé sinon).
 */
import { desc } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import type { ApiResourceDefinition, ModuleApiDeclaration } from "@/core/api/contract";
import { iso, tableReader } from "@/core/api/table";
import { forums } from "../schema";

type Row = typeof forums.$inferSelect;

export const serializeForums = (r: Row) => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  updatedAt: iso(r.updatedAt),
});

const reader = tableReader<Row, ReturnType<typeof serializeForums>>(
  {
    name: "forums",
    columns: { id: forums.id, createdAt: forums.createdAt, organizationId: forums.organizationId },
    select: (where, limit) => getDrizzle().select().from(forums).where(where).orderBy(desc(forums.createdAt), desc(forums.id)).limit(limit),
    filters: [],
  },
  serializeForums,
);

export const forumsResource: ApiResourceDefinition<ReturnType<typeof serializeForums>> = {
  name: "forums",
  module: "forums",
  description: "Forums de l'organisation du site.",
  scope: "forums:read",
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

export const forumsApi: ModuleApiDeclaration = {
  module: "forums",
  resources: [forumsResource as ApiResourceDefinition<unknown>],
  events: [],
};
