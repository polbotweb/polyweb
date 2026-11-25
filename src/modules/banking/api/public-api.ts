/**
 * API publique du module banking (registre `@/core/api`) : ressource `bank-imports` — lecture
 * (`banking:read`) de l'historique des imports et dépôt d'un relevé (`banking:write`, corps JSON
 * `{ bankAccountId, fileName, contentBase64, format? }`, Idempotency-Key gérée par le cœur ;
 * un même fichier réimporté est sans effet). Tenant = organisation du site de la clé.
 * Événements webhooks `banking.*` publiés par l'outbox transactionnelle.
 * Ne JAMAIS importer ici un module qui dépend d'`astro:actions` (services chargés à la demande).
 */
import { desc, eq } from "drizzle-orm";
import { Effect, Schema } from "effect";
import { getDrizzle } from "@database/drizzle";
import type { ApiResourceDefinition, ApiTenant, ModuleApiDeclaration } from "@/core/api/contract";
import { iso, tableReader } from "@/core/api/table";
import { fail } from "@/lib/effect/failure";
import { decode } from "@/lib/effect/schema";
import { IMPORT_STATUSES, STATEMENT_FORMATS, type StatementFormat } from "../domain/constants";
import { bankImports } from "../schema";

type Row = typeof bankImports.$inferSelect;
const MAX_BASE64 = 14_000_000;

export const serializeBankImport = (r: Row) => ({
  id: r.id,
  bankAccountId: r.bankAccountId,
  source: r.source,
  format: r.format,
  status: r.status,
  fileName: r.fileName,
  sha256: r.sha256,
  statementCount: r.statementCount,
  lineCount: r.lineCount,
  insertedCount: r.insertedCount,
  duplicateCount: r.duplicateCount,
  mergedCount: r.mergedCount,
  autoMatchedCount: r.autoMatchedCount,
  error: r.error,
  createdAt: r.createdAt.toISOString(),
  updatedAt: iso(null),
});

const reader = tableReader<Row, ReturnType<typeof serializeBankImport>>(
  {
    name: "bank-imports",
    columns: { id: bankImports.id, createdAt: bankImports.createdAt, organizationId: bankImports.organizationId },
    select: (where, limit) => getDrizzle().select().from(bankImports).where(where).orderBy(desc(bankImports.createdAt), desc(bankImports.id)).limit(limit),
    filters: [
      { name: "status", description: "Statut de l'import.", values: IMPORT_STATUSES, where: (v) => eq(bankImports.status, v as Row["status"]) },
      { name: "bankAccountId", description: "Compte bancaire.", where: (v) => eq(bankImports.bankAccountId, v) },
    ],
  },
  serializeBankImport,
);

const ImportCreate = Schema.Struct({
  bankAccountId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  fileName: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  contentBase64: Schema.String.check(Schema.isMinLength(4), Schema.isMaxLength(MAX_BASE64)),
  format: Schema.optional(Schema.NullOr(Schema.String)),
});

export const bankImportsResource: ApiResourceDefinition<ReturnType<typeof serializeBankImport>> = {
  name: "bank-imports",
  module: "banking",
  description: "Imports de relevés bancaires (CAMT, MT940, CFONB, OFX, QIF, CSV) de l'organisation du site.",
  scope: "banking:read",
  writeScope: "banking:write",
  filters: reader.filters,
  schema: {
    properties: {
      id: { type: "string" }, bankAccountId: { type: "string" }, source: { type: "string" }, format: { type: "string" }, status: { type: "string" },
      fileName: { type: "string", nullable: true }, sha256: { type: "string" }, statementCount: { type: "integer" }, lineCount: { type: "integer" },
      insertedCount: { type: "integer" }, duplicateCount: { type: "integer" }, mergedCount: { type: "integer" }, autoMatchedCount: { type: "integer" },
      error: { type: "string", nullable: true }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time", nullable: true },
    },
    required: ["id", "bankAccountId", "format", "status", "sha256", "createdAt"],
  },
  inputSchema: {
    properties: {
      bankAccountId: { type: "string" }, fileName: { type: "string" }, contentBase64: { type: "string", description: "Contenu du fichier encodé en base64 (10 Mo max)." },
      format: { type: "string", nullable: true, description: `Format imposé (${STATEMENT_FORMATS.join(", ")}), sinon détecté.` },
    },
    required: ["bankAccountId", "fileName", "contentBase64"],
  },
  list: reader.list,
  get: reader.get,
  create: (tenant: ApiTenant, body: unknown) =>
    Effect.gen(function* () {
      const input = yield* decode(ImportCreate)(body);
      if (input.format && !(STATEMENT_FORMATS as readonly string[]).includes(input.format)) return yield* fail("BAD_REQUEST", "Format de relevé inconnu.");
      const { importStatement } = yield* Effect.promise(() => import("../services/import.service"));
      const outcome = yield* importStatement(tenant.organizationId, {
        bankAccountId: input.bankAccountId, fileName: input.fileName, bytes: Uint8Array.from(Buffer.from(input.contentBase64, "base64")),
        format: (input.format ?? null) as StatementFormat | null, source: "api",
      }, tenant.actorUserId);
      const [row] = yield* Effect.promise(() => getDrizzle().select().from(bankImports).where(eq(bankImports.id, outcome.importId)).limit(1));
      return serializeBankImport(row!);
    }),
};

export const bankingApi: ModuleApiDeclaration = {
  module: "banking",
  resources: [bankImportsResource as ApiResourceDefinition<unknown>],
  events: [
    { name: "banking.imported", description: "Relevé bancaire importé (lignes insérées, continuité)." },
    { name: "banking.reconciled", description: "Rapprochement bancaire validé." },
    { name: "banking.unreconciled", description: "Rapprochement bancaire annulé (contrepassation)." },
  ],
};
