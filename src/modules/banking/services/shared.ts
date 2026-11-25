/** Aides communes aux services banking : portée tenant, audit transactionnel, dates. */
import { eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { auditLog } from "@database/schemas/audit-log.schema";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";

/** Organisation `organizationId` (`null` = plateforme). */
export const tenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));

/** Date du jour (Europe/Paris, AAAA-MM-JJ) : dates comptables françaises. */
export const bankingToday = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** Audit d'une action banking, dans la transaction de l'écriture (jamais d'IBAN complet ni de secret). */
export const bankingAudit = (
  tx: DbTransaction,
  input: { readonly actorId: string | null; readonly action: `banking.${string}` | `accounting.${string}`; readonly resource: string; readonly resourceId: string; readonly organizationId: string | null; readonly metadata?: Record<string, unknown> },
) =>
  dbTry("banking.audit", () =>
    tx.insert(auditLog).values({
      userId: input.actorId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      organizationId: input.organizationId,
      siteId: null,
      module: input.action.startsWith("accounting.") ? "accounting" : "banking",
      outcome: "success",
      metadata: input.metadata ?? {},
    }),
  );
