/**
 * API publique du module Ventes (lecture seule, `sales:read`) : devis,
 * factures et avoirs. La lecture par id inclut les lignes.
 * Aucune écriture : les documents légaux ne se modifient que dans l'admin.
 */
import { asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import type { ApiObjectSchema, ApiResourceDefinition, ModuleApiDeclaration } from "@/core/api/contract";
import { iso, tableReader } from "@/core/api/table";
import { dbTry } from "@/lib/effect/run";
import { SALES_STATUSES, type SalesDocumentKind } from "../domain/workflow";
import { sales, salesDocumentLines } from "../schema";

type SalesRow = typeof sales.$inferSelect;
type LineRow = typeof salesDocumentLines.$inferSelect;

export const serializeSalesDocument = (r: SalesRow) => ({
  id: r.id,
  kind: r.kind,
  number: r.number,
  status: r.status,
  title: r.title,
  sourceDocumentId: r.sourceDocumentId,
  customer: { name: r.customerName, email: r.customerEmail, address: r.customerAddress, country: r.customerCountry, type: r.customerType, vatNumber: r.customerVatNumber },
  currency: r.currency,
  netMinor: r.netMinor,
  taxMinor: r.taxMinor,
  grossMinor: r.grossMinor,
  paidMinor: r.paidMinor,
  creditedMinor: r.creditedMinor,
  issueDate: r.issueDate,
  dueDate: r.dueDate,
  createdAt: r.createdAt.toISOString(),
  updatedAt: iso(r.updatedAt),
});

const serializeLine = (l: LineRow) => ({
  position: l.position,
  description: l.description,
  quantity: l.quantity,
  unitPriceMinor: l.unitPriceMinor,
  discountPercent: l.discountPercent,
  taxCategory: l.taxCategory,
  ratePercent: l.ratePercent,
  netMinor: l.netMinor,
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const documentSchema: ApiObjectSchema = {
  properties: {
    id: { type: "string" },
    kind: { type: "string", enum: ["quote", "invoice", "credit_note"] },
    number: { type: "string", nullable: true, description: "Numéro légal (null tant que brouillon)." },
    status: { type: "string", enum: SALES_STATUSES },
    title: { type: "string" },
    sourceDocumentId: { type: "string", nullable: true },
    customer: { type: "object", description: "name, email, address, country, type (B2B/B2C), vatNumber." },
    currency: { type: "string" },
    netMinor: { type: "integer" },
    taxMinor: { type: "integer" },
    grossMinor: { type: "integer" },
    paidMinor: { type: "integer" },
    creditedMinor: { type: "integer" },
    issueDate: { type: "string", format: "date", nullable: true },
    dueDate: { type: "string", format: "date", nullable: true },
    lines: { type: "array", description: "Lignes (lecture par id uniquement).", items: { type: "object" } },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time", nullable: true },
  },
  required: ["id", "kind", "status", "currency", "grossMinor", "createdAt"],
};

const salesResource = (name: string, kind: SalesDocumentKind, description: string): ApiResourceDefinition<unknown> => {
  const reader = tableReader<SalesRow, ReturnType<typeof serializeSalesDocument>>(
    {
      name,
      columns: { id: sales.id, createdAt: sales.createdAt, organizationId: sales.organizationId },
      scope: eq(sales.kind, kind),
      select: (where, limit) => getDrizzle().select().from(sales).where(where).orderBy(desc(sales.createdAt), desc(sales.id)).limit(limit),
      filters: [
        { name: "status", description: "Statut.", values: SALES_STATUSES, where: (v) => eq(sales.status, v as SalesRow["status"]) },
        { name: "number", description: "Numéro légal exact.", where: (v) => eq(sales.number, v) },
        { name: "customerEmail", description: "E-mail client exact.", where: (v) => eq(sales.customerEmail, v.trim().toLowerCase()) },
        { name: "issuedFrom", description: "Date d'émission ≥ (AAAA-MM-JJ).", where: (v) => (DATE.test(v) ? gte(sales.issueDate, v) : sql`false`) },
        { name: "issuedTo", description: "Date d'émission ≤ (AAAA-MM-JJ).", where: (v) => (DATE.test(v) ? lte(sales.issueDate, v) : sql`false`) },
      ],
    },
    serializeSalesDocument,
  );
  return {
    name,
    module: "sales",
    description,
    scope: "sales:read",
    filters: reader.filters,
    schema: documentSchema,
    list: reader.list,
    get: (tenant, id) =>
      Effect.gen(function* () {
        const row = yield* reader.find(tenant, id);
        if (!row) return undefined;
        const lines = yield* dbTry(`api.${name}.lines`, () =>
          getDrizzle().select().from(salesDocumentLines).where(eq(salesDocumentLines.documentId, row.id)).orderBy(asc(salesDocumentLines.position)));
        return { ...serializeSalesDocument(row), lines: lines.map(serializeLine) };
      }),
  };
};

export const salesApi: ModuleApiDeclaration = {
  module: "sales",
  resources: [
    salesResource("quotes", "quote", "Devis."),
    salesResource("invoices", "invoice", "Factures."),
    salesResource("credit-notes", "credit_note", "Avoirs."),
  ],
  events: [
    { name: "invoice.issued", description: "Facture émise (numéro définitif attribué)." },
    { name: "invoice.paid", description: "Facture intégralement payée." },
    { name: "credit_note.issued", description: "Avoir émis." },
  ],
};
