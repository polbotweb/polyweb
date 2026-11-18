/** Lectures des listes étendues (factures, retours, SEPA, imports, réassort). */
import { Effect } from "effect";
import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { purchasingSuppliers } from "../schema";
import {
  purchasingEinvoiceImports, purchasingInvoices, purchasingReorderRules, purchasingReorderSuggestions,
  purchasingReturns, purchasingSepaExports,
} from "../schema/extended";

const tenant = (column: PgColumn, organizationId: string | null): SQL =>
  organizationId === null ? isNull(column) : eq(column, organizationId);

export const listSupplierInvoices = (organizationId: string | null) =>
  dbTry("purchasing.invoices.list", () => getDrizzle().select({
    invoice: purchasingInvoices, supplierName: purchasingSuppliers.name,
  }).from(purchasingInvoices).innerJoin(purchasingSuppliers, eq(purchasingSuppliers.id, purchasingInvoices.supplierId))
    .where(tenant(purchasingInvoices.organizationId, organizationId))
    .orderBy(desc(purchasingInvoices.createdAt)).limit(100));

export const listReturns = (organizationId: string | null) =>
  dbTry("purchasing.returns.list", () => getDrizzle().select({
    ret: purchasingReturns, supplierName: purchasingSuppliers.name,
  }).from(purchasingReturns).innerJoin(purchasingSuppliers, eq(purchasingSuppliers.id, purchasingReturns.supplierId))
    .where(tenant(purchasingReturns.organizationId, organizationId))
    .orderBy(desc(purchasingReturns.createdAt)).limit(100));

export const listSepaExports = (organizationId: string | null) =>
  dbTry("purchasing.sepa.list", () => getDrizzle().select().from(purchasingSepaExports)
    .where(tenant(purchasingSepaExports.organizationId, organizationId)).orderBy(desc(purchasingSepaExports.createdAt)).limit(100));

export const listEinvoiceImports = (organizationId: string | null) =>
  dbTry("purchasing.imports.list", () => getDrizzle().select().from(purchasingEinvoiceImports)
    .where(tenant(purchasingEinvoiceImports.organizationId, organizationId)).orderBy(desc(purchasingEinvoiceImports.createdAt)).limit(100));

export const listReorderBoard = (organizationId: string | null) =>
  Effect.gen(function* () {
    const rules = yield* dbTry("purchasing.reorder.rules.list", () => getDrizzle().select().from(purchasingReorderRules)
      .where(tenant(purchasingReorderRules.organizationId, organizationId)).orderBy(desc(purchasingReorderRules.updatedAt)).limit(100));
    const suggestions = yield* dbTry("purchasing.reorder.suggestions.list", () => getDrizzle().select().from(purchasingReorderSuggestions)
      .where(and(tenant(purchasingReorderSuggestions.organizationId, organizationId), eq(purchasingReorderSuggestions.status, "open")))
      .orderBy(desc(purchasingReorderSuggestions.createdAt)).limit(100));
    return { rules, suggestions };
  });

export const listSuppliersBrief = (organizationId: string | null) =>
  dbTry("purchasing.suppliers.brief", () => getDrizzle().select({
    id: purchasingSuppliers.id, code: purchasingSuppliers.code, name: purchasingSuppliers.name,
  }).from(purchasingSuppliers).where(and(tenant(purchasingSuppliers.organizationId, organizationId), eq(purchasingSuppliers.active, true))).orderBy(purchasingSuppliers.code));
