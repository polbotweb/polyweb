/** Audit des actions petites annonces, dans la transaction de l'écriture. */
import { auditLog } from "@database/schemas/audit-log.schema";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";

export const classifiedsAudit = (
  tx: DbTransaction,
  input: { actorId: string | null; action: `classifieds.${string}.${string}`; resource: string; resourceId: string; organizationId: string | null; siteId: string | null; metadata: Record<string, unknown> },
) =>
  dbTry("classifieds.audit", () =>
    tx.insert(auditLog).values({
      userId: input.actorId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      organizationId: input.organizationId,
      siteId: input.siteId,
      module: "classifieds",
      outcome: "success",
      metadata: input.metadata,
    }),
  );
